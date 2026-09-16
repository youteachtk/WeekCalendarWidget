import SwiftUI

@main
struct WeekCalIOSApp: App {
    @StateObject private var store = CalendarStore()

    var body: some Scene {
        WindowGroup {
            RootView(store: store)
                .task {
                    await store.requestAccessAndLoad()
                }
        }
    }
}

private struct RootView: View {
    @ObservedObject var store: CalendarStore

    var body: some View {
        switch store.access {
        case .unknown:
            ProgressView("Preparando calendario…")
        case .granted:
            WeekCalendarView(store: store)
        case .denied:
            VStack(spacing: 14) {
                Image(systemName: "calendar.badge.exclamationmark")
                    .font(.system(size: 42))
                Text("WeekCal necesita acceso a Calendario")
                    .font(.headline)
                Text("Activa el permiso de Calendario en Ajustes para mostrar tu semana.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button("Intentar de nuevo") {
                    Task { await store.requestAccessAndLoad() }
                }
            }
            .padding(28)
        }
    }
}
