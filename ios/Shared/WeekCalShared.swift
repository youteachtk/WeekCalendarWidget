import Foundation
import SwiftUI

struct WeekCalEvent: Identifiable, Codable, Hashable {
    var id: String
    var title: String
    var start: Date
    var end: Date
    var allDay: Bool
    var colorHex: String
    var location: String?
    var calendarTitle: String?
}

struct WeekCalSnapshot: Codable {
    var generatedAt: Date
    var startHour: Int
    var endHour: Int
    var events: [WeekCalEvent]

    static let empty = WeekCalSnapshot(
        generatedAt: Date(),
        startHour: 8,
        endHour: 23,
        events: []
    )
}

enum WeekCalShared {
    static let appGroup = "group.tk.youteach.weekcal"
    static let snapshotKey = "weekcal.snapshot.v1"

    static func save(_ snapshot: WeekCalSnapshot) {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: snapshotKey)
    }

    static func load() -> WeekCalSnapshot {
        guard let defaults = UserDefaults(suiteName: appGroup),
              let data = defaults.data(forKey: snapshotKey),
              let snapshot = try? JSONDecoder().decode(WeekCalSnapshot.self, from: data) else {
            return .empty
        }
        return snapshot
    }
}

extension Color {
    init(weekCalHex hex: String) {
        var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if value.hasPrefix("#") { value.removeFirst() }
        let rgb = UInt64(value, radix: 16) ?? 0x4F7CFF
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xff) / 255,
            green: Double((rgb >> 8) & 0xff) / 255,
            blue: Double(rgb & 0xff) / 255,
            opacity: 1
        )
    }
}

enum WeekCalDate {
    static var calendar: Calendar {
        var cal = Calendar(identifier: .gregorian)
        cal.locale = Locale(identifier: "es_MX")
        cal.firstWeekday = 2
        return cal
    }

    static func startOfWeek(containing date: Date) -> Date {
        let cal = calendar
        let components = cal.dateComponents([.yearForWeekOfYear, .weekOfYear], from: date)
        return cal.date(from: components) ?? cal.startOfDay(for: date)
    }

    static func addDays(_ value: Int, to date: Date) -> Date {
        calendar.date(byAdding: .day, value: value, to: date) ?? date
    }

    static func sameDay(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, inSameDayAs: b)
    }

    static func dayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = "EEE"
        return formatter.string(from: date).replacingOccurrences(of: ".", with: "").lowercased()
    }

    static func monthLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "es_MX")
        formatter.dateFormat = "LLLL"
        return formatter.string(from: date).lowercased()
    }
}
