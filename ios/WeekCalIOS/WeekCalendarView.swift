import SwiftUI

struct WeekCalendarView: View {
    @ObservedObject var store: CalendarStore
    @AppStorage("weekcal.startHour") private var startHour = 8
    @AppStorage("weekcal.endHour") private var endHour = 23
    @State private var weekOffset = 0

    private var weekStart: Date {
        WeekCalDate.addDays(weekOffset * 7, to: WeekCalDate.startOfWeek(containing: Date()))
    }

    private var visibleEvents: [WeekCalEvent] {
        let end = WeekCalDate.addDays(7, to: weekStart)
        return store.events.filter { $0.end > weekStart && $0.start < end }
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color.black.opacity(0.92), Color.black.opacity(0.76)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                header
                GeometryReader { proxy in
                    CalendarGrid(
                        weekStart: weekStart,
                        events: visibleEvents,
                        startHour: startHour,
                        endHour: max(startHour + 4, endHour),
                        size: proxy.size
                    )
                }
                footer
            }
        }
        .preferredColorScheme(.dark)
    }

    private var header: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 2) {
                Text(WeekCalDate.monthLabel(weekStart))
                    .font(.system(size: 28, weight: .regular))
                Text(String(WeekCalDate.calendar.component(.year, from: weekStart)))
                    .foregroundStyle(.secondary)
                    .offset(x: 152, y: -32)
                    .frame(height: 0)
                Text("Semana \(WeekCalDate.calendar.component(.weekOfYear, from: weekStart))")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button {
                store.loadCurrentWeek(startHour: startHour, endHour: endHour)
            } label: {
                Image(systemName: "arrow.clockwise")
                    .font(.title2)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
        .padding(.bottom, 6)
    }

    private var footer: some View {
        HStack {
            Button { weekOffset -= 1 } label: { Image(systemName: "chevron.left") }
            Spacer()
            Button("Hoy") { weekOffset = 0 }
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Button { weekOffset += 1 } label: { Image(systemName: "chevron.right") }
        }
        .font(.title2)
        .buttonStyle(.plain)
        .padding(.horizontal, 42)
        .frame(height: 42)
    }
}

private struct CalendarGrid: View {
    let weekStart: Date
    let events: [WeekCalEvent]
    let startHour: Int
    let endHour: Int
    let size: CGSize

    private let timeWidth: CGFloat = 34
    private let dayHeaderHeight: CGFloat = 34
    private let allDayHeight: CGFloat = 28

    var body: some View {
        let contentHeight = max(140, size.height - dayHeaderHeight - allDayHeight)
        let hourHeight = contentHeight / CGFloat(max(4, endHour - startHour))
        let dayWidth = max(28, (size.width - timeWidth) / 7)

        ZStack(alignment: .topLeading) {
            Color.black.opacity(0.22)

            ForEach(0..<8, id: \.self) { column in
                Rectangle()
                    .fill(Color.white.opacity(0.18))
                    .frame(width: 0.6, height: size.height)
                    .offset(x: timeWidth + CGFloat(column) * dayWidth)
            }

            ForEach(startHour...endHour, id: \.self) { hour in
                let y = dayHeaderHeight + allDayHeight + CGFloat(hour - startHour) * hourHeight
                Rectangle()
                    .fill(Color.white.opacity(0.17))
                    .frame(width: size.width, height: 0.6)
                    .offset(y: y)

                if hour < endHour {
                    Text(String(format: "%02d", hour))
                        .font(.system(size: 10))
                        .foregroundStyle(.secondary)
                        .offset(x: 5, y: y + 6)
                }
            }

            ForEach(0..<7, id: \.self) { index in
                let date = WeekCalDate.addDays(index, to: weekStart)
                let x = timeWidth + CGFloat(index) * dayWidth

                if WeekCalDate.sameDay(date, Date()) {
                    Rectangle()
                        .fill(Color.white.opacity(0.16))
                        .frame(width: dayWidth, height: size.height)
                        .offset(x: x)
                }

                HStack(spacing: 2) {
                    Text(WeekCalDate.dayLabel(date))
                    Text("\(WeekCalDate.calendar.component(.day, from: date))")
                        .font(.caption2)
                }
                .font(.system(size: 11, weight: WeekCalDate.sameDay(date, Date()) ? .semibold : .regular))
                .foregroundStyle(WeekCalDate.sameDay(date, Date()) ? .white : .secondary)
                .frame(width: dayWidth, height: dayHeaderHeight)
                .offset(x: x)

                let allDay = events.filter { $0.allDay && WeekCalDate.sameDay($0.start, date) }
                ForEach(Array(allDay.prefix(1))) { event in
                    Text(event.title)
                        .font(.system(size: 8, weight: .medium))
                        .lineLimit(1)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 3)
                        .frame(width: dayWidth - 2, height: allDayHeight - 3, alignment: .leading)
                        .background(Color(weekCalHex: event.colorHex))
                        .offset(x: x + 1, y: dayHeaderHeight + 1)
                }

                let timed = events.filter { !$0.allDay && WeekCalDate.sameDay($0.start, date) }
                ForEach(timed) { event in
                    let startMinutes = minutesSinceStart(event.start)
                    let endMinutes = minutesSinceStart(event.end)
                    if endMinutes > 0 && startMinutes < (endHour - startHour) * 60 {
                        let clampedStart = max(0, startMinutes)
                        let clampedEnd = min((endHour - startHour) * 60, endMinutes)
                        let top = dayHeaderHeight + allDayHeight + CGFloat(clampedStart) / 60 * hourHeight
                        let height = max(12, CGFloat(clampedEnd - clampedStart) / 60 * hourHeight - 1)

                        VStack(alignment: .leading, spacing: 1) {
                            Text(event.title)
                                .font(.system(size: 8.5, weight: .semibold))
                                .lineLimit(1)
                            if height > 26, let location = event.location, !location.isEmpty {
                                Text(location)
                                    .font(.system(size: 7.5))
                                    .lineLimit(1)
                                    .opacity(0.85)
                            }
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 3)
                        .padding(.vertical, 2)
                        .frame(width: dayWidth - 2, height: height, alignment: .topLeading)
                        .background(Color(weekCalHex: event.colorHex))
                        .offset(x: x + 1, y: top)
                    }
                }
            }
        }
        .clipped()
    }

    private func minutesSinceStart(_ date: Date) -> Int {
        let comps = WeekCalDate.calendar.dateComponents([.hour, .minute], from: date)
        return ((comps.hour ?? 0) - startHour) * 60 + (comps.minute ?? 0)
    }
}
