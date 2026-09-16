import EventKit
import Foundation
import SwiftUI
import WidgetKit

@MainActor
final class CalendarStore: ObservableObject {
    enum AccessState {
        case unknown
        case granted
        case denied
    }

    @Published var access: AccessState = .unknown
    @Published var events: [WeekCalEvent] = []
    @Published var errorMessage: String?

    private let eventStore = EKEventStore()

    func requestAccessAndLoad(startHour: Int = 8, endHour: Int = 23) async {
        do {
            let granted: Bool
            if #available(iOS 17.0, *) {
                granted = try await eventStore.requestFullAccessToEvents()
            } else {
                granted = try await withCheckedThrowingContinuation { continuation in
                    eventStore.requestAccess(to: .event) { allowed, error in
                        if let error { continuation.resume(throwing: error) }
                        else { continuation.resume(returning: allowed) }
                    }
                }
            }

            access = granted ? .granted : .denied
            if granted {
                loadCurrentWeek(startHour: startHour, endHour: endHour)
            }
        } catch {
            access = .denied
            errorMessage = error.localizedDescription
        }
    }

    func loadCurrentWeek(startHour: Int = 8, endHour: Int = 23) {
        guard access == .granted else { return }
        let start = WeekCalDate.startOfWeek(containing: Date())
        let end = WeekCalDate.addDays(7, to: start)
        let predicate = eventStore.predicateForEvents(withStart: start, end: end, calendars: nil)
        let models = eventStore.events(matching: predicate)
            .filter { !$0.isDetached || !$0.isCanceled }
            .map(Self.model(from:))
            .sorted { $0.start < $1.start }

        events = models
        WeekCalShared.save(WeekCalSnapshot(
            generatedAt: Date(),
            startHour: startHour,
            endHour: endHour,
            events: models
        ))
        WidgetCenter.shared.reloadAllTimelines()
    }

    private static func model(from event: EKEvent) -> WeekCalEvent {
        let color = bc2Color(from: event.notes) ?? calendarColor(event.calendar.cgColor)
        return WeekCalEvent(
            id: event.eventIdentifier ?? UUID().uuidString,
            title: event.title?.isEmpty == false ? event.title : "(Sin título)",
            start: event.startDate,
            end: event.endDate,
            allDay: event.isAllDay,
            colorHex: color,
            location: event.location,
            calendarTitle: event.calendar.title
        )
    }

    private static func bc2Color(from notes: String?) -> String? {
        guard let notes else { return nil }
        let pattern = #"(?im)^\s*BC2-Color:\s*(-?\d+)\s*$"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: notes, range: NSRange(notes.startIndex..., in: notes)),
              let range = Range(match.range(at: 1), in: notes),
              let signed = Int64(notes[range]) else { return nil }

        let raw = UInt32(truncatingIfNeeded: signed)
        return String(format: "#%06X", raw & 0x00FF_FFFF)
    }

    private static func calendarColor(_ cgColor: CGColor) -> String {
        guard let components = cgColor.components else { return "#4F7CFF" }
        let r: CGFloat
        let g: CGFloat
        let b: CGFloat
        if components.count >= 3 {
            r = components[0]
            g = components[1]
            b = components[2]
        } else {
            r = components[0]
            g = components[0]
            b = components[0]
        }
        return String(
            format: "#%02X%02X%02X",
            Int(max(0, min(1, r)) * 255),
            Int(max(0, min(1, g)) * 255),
            Int(max(0, min(1, b)) * 255)
        )
    }
}

private extension EKEvent {
    var isCanceled: Bool {
        status == .canceled
    }
}
