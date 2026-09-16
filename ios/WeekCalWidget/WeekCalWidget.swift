import SwiftUI
import WidgetKit

struct WeekCalWidgetEntry: TimelineEntry {
    let date: Date
    let snapshot: WeekCalSnapshot
}

struct WeekCalWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeekCalWidgetEntry {
        WeekCalWidgetEntry(date: Date(), snapshot: .empty)
    }

    func getSnapshot(in context: Context, completion: @escaping (WeekCalWidgetEntry) -> Void) {
        completion(WeekCalWidgetEntry(date: Date(), snapshot: WeekCalShared.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WeekCalWidgetEntry>) -> Void) {
        let entry = WeekCalWidgetEntry(date: Date(), snapshot: WeekCalShared.load())
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date().addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

struct WeekCalWidgetView: View {
    let entry: WeekCalWidgetEntry

    var body: some View {
        GeometryReader { proxy in
            let start = WeekCalDate.startOfWeek(containing: Date())
            VStack(spacing: 4) {
                HStack {
                    Text(WeekCalDate.monthLabel(start))
                        .font(.system(size: 15, weight: .semibold))
                    Spacer()
                    Text("S\(WeekCalDate.calendar.component(.weekOfYear, from: start))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 2) {
                    ForEach(0..<7, id: \.self) { index in
                        let date = WeekCalDate.addDays(index, to: start)
                        VStack(spacing: 3) {
                            Text("\(WeekCalDate.dayLabel(date))\(WeekCalDate.calendar.component(.day, from: date))")
                                .font(.system(size: 8, weight: WeekCalDate.sameDay(date, Date()) ? .bold : .regular))
                                .foregroundStyle(WeekCalDate.sameDay(date, Date()) ? .primary : .secondary)

                            let items = entry.snapshot.events
                                .filter { WeekCalDate.sameDay($0.start, date) }
                                .sorted { $0.start < $1.start }

                            ForEach(Array(items.prefix(proxy.size.height > 180 ? 5 : 3))) { event in
                                Text(event.title)
                                    .font(.system(size: 7, weight: .medium))
                                    .lineLimit(1)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                                    .padding(.horizontal, 2)
                                    .padding(.vertical, 2)
                                    .background(Color(weekCalHex: event.colorHex))
                                    .foregroundStyle(.white)
                                    .clipShape(RoundedRectangle(cornerRadius: 2))
                            }
                            Spacer(minLength: 0)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
            }
            .padding(9)
        }
        .containerBackground(.black.opacity(0.88), for: .widget)
        .preferredColorScheme(.dark)
    }
}

@main
struct WeekCalWidget: Widget {
    let kind = "WeekCalWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeekCalWidgetProvider()) { entry in
            WeekCalWidgetView(entry: entry)
        }
        .configurationDisplayName("WeekCal")
        .description("Tu semana con los colores de Business Calendar.")
        .supportedFamilies([.systemMedium, .systemLarge])
    }
}
