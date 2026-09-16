using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;

internal static class Program
{
    private const int GWL_STYLE = -16;
    private const int GWL_EXSTYLE = -20;
    private const long WS_CHILD = 0x40000000L;
    private const long WS_POPUP = unchecked((long)0x80000000L);
    private const long WS_MINIMIZEBOX = 0x00020000L;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_APPWINDOW = 0x00040000L;
    private const long LVS_AUTOARRANGE = 0x0100L;

    private const uint WM_SPAWN_WORKER = 0x052C;
    private const uint SMTO_NORMAL = 0x0000;
    private const uint SWP_NOSIZE = 0x0001;
    private const uint SWP_NOMOVE = 0x0002;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_SHOWWINDOW = 0x0040;

    private const uint LVM_FIRST = 0x1000;
    private const uint LVM_GETITEMCOUNT = LVM_FIRST + 4;
    private const uint LVM_GETITEMPOSITION = LVM_FIRST + 16;
    private const uint LVM_SETITEMPOSITION32 = LVM_FIRST + 49;
    private const uint LVM_GETITEMSPACING = LVM_FIRST + 51;

    private const uint PROCESS_VM_OPERATION = 0x0008;
    private const uint PROCESS_VM_READ = 0x0010;
    private const uint PROCESS_VM_WRITE = 0x0020;
    private const uint PROCESS_QUERY_INFORMATION = 0x0400;
    private const uint MEM_COMMIT = 0x1000;
    private const uint MEM_RESERVE = 0x2000;
    private const uint MEM_RELEASE = 0x8000;
    private const uint PAGE_READWRITE = 0x04;

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X; public int Y; }

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    private sealed class IconPosition
    {
        public int Index { get; set; }
        public int X { get; set; }
        public int Y { get; set; }
    }

    private sealed class IconLayoutState
    {
        public bool AutoArrange { get; set; }
        public List<IconPosition> Positions { get; set; } = new();
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr FindWindowEx(IntPtr hWndParent, IntPtr hWndChildAfter, string? lpszClass, string? lpszWindow);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [DllImport("user32.dll", CharSet = CharSet.Auto)]
    private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam,
        uint fuFlags, uint uTimeout, out IntPtr lpdwResult);

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetClientRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    private static extern int MapWindowPoints(IntPtr hWndFrom, IntPtr hWndTo, [In, Out] POINT[] lpPoints, uint cPoints);

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint dwDesiredAccess, bool bInheritHandle, uint dwProcessId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr VirtualAllocEx(IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize, uint flAllocationType, uint flProtect);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool VirtualFreeEx(IntPtr hProcess, IntPtr lpAddress, UIntPtr dwSize, uint dwFreeType);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool ReadProcessMemory(IntPtr hProcess, IntPtr lpBaseAddress, [Out] byte[] lpBuffer, int dwSize, out IntPtr lpNumberOfBytesRead);

    [DllImport("kernel32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool CloseHandle(IntPtr hObject);

    private static IntPtr FindDesktopWorker()
    {
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
            SendMessageTimeout(progman, WM_SPAWN_WORKER, IntPtr.Zero, IntPtr.Zero, SMTO_NORMAL, 1000, out _);

        IntPtr worker = IntPtr.Zero;
        EnumWindows((top, _) =>
        {
            var shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                var candidate = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                if (candidate != IntPtr.Zero) worker = candidate;
            }
            return true;
        }, IntPtr.Zero);

        return worker != IntPtr.Zero ? worker : progman;
    }

    private static IntPtr FindDesktopListView()
    {
        IntPtr listView = IntPtr.Zero;
        EnumWindows((top, _) =>
        {
            var shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView == IntPtr.Zero) return true;
            listView = FindWindowEx(shellView, IntPtr.Zero, "SysListView32", "FolderView");
            if (listView == IntPtr.Zero)
                listView = FindWindowEx(shellView, IntPtr.Zero, "SysListView32", null);
            return listView == IntPtr.Zero;
        }, IntPtr.Zero);

        if (listView == IntPtr.Zero)
        {
            var progman = FindWindow("Progman", null);
            var shellView = FindWindowEx(progman, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                listView = FindWindowEx(shellView, IntPtr.Zero, "SysListView32", "FolderView");
                if (listView == IntPtr.Zero)
                    listView = FindWindowEx(shellView, IntPtr.Zero, "SysListView32", null);
            }
        }
        return listView;
    }

    private static void SetChildStyle(IntPtr hwnd, bool child)
    {
        var style = GetWindowLongPtr(hwnd, GWL_STYLE).ToInt64();
        var exStyle = GetWindowLongPtr(hwnd, GWL_EXSTYLE).ToInt64();
        if (child)
        {
            style &= ~WS_POPUP;
            style &= ~WS_MINIMIZEBOX;
            style |= WS_CHILD;
            exStyle |= WS_EX_TOOLWINDOW;
            exStyle &= ~WS_EX_APPWINDOW;
        }
        else
        {
            style &= ~WS_CHILD;
            style |= WS_POPUP;
            exStyle &= ~WS_EX_TOOLWINDOW;
        }
        SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr(style));
        SetWindowLongPtr(hwnd, GWL_EXSTYLE, new IntPtr(exStyle));
    }

    private static void SetAutoArrange(IntPtr listView, bool enabled)
    {
        var style = GetWindowLongPtr(listView, GWL_STYLE).ToInt64();
        style = enabled ? style | LVS_AUTOARRANGE : style & ~LVS_AUTOARRANGE;
        SetWindowLongPtr(listView, GWL_STYLE, new IntPtr(style));
        SetWindowPos(listView, IntPtr.Zero, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED);
    }

    private static bool IsAutoArrange(IntPtr listView)
        => (GetWindowLongPtr(listView, GWL_STYLE).ToInt64() & LVS_AUTOARRANGE) != 0;

    private static (int X, int Y) GetSpacing(IntPtr listView)
    {
        var raw = SendMessage(listView, LVM_GETITEMSPACING, IntPtr.Zero, IntPtr.Zero).ToInt64();
        var x = (int)(raw & 0xffff);
        var y = (int)((raw >> 16) & 0xffff);
        if (x < 32 || x > 300) x = 80;
        if (y < 32 || y > 300) y = 84;
        return (x, y);
    }

    private static List<IconPosition> ReadPositions(IntPtr listView)
    {
        var count = SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
        var result = new List<IconPosition>(Math.Max(0, count));
        if (count <= 0) return result;

        GetWindowThreadProcessId(listView, out var pid);
        var process = OpenProcess(PROCESS_VM_OPERATION | PROCESS_VM_READ | PROCESS_VM_WRITE | PROCESS_QUERY_INFORMATION, false, pid);
        if (process == IntPtr.Zero) throw new InvalidOperationException("No se pudo acceder a Explorer para leer los iconos.");

        var remote = VirtualAllocEx(process, IntPtr.Zero, (UIntPtr)8, MEM_COMMIT | MEM_RESERVE, PAGE_READWRITE);
        if (remote == IntPtr.Zero)
        {
            CloseHandle(process);
            throw new InvalidOperationException("No se pudo reservar memoria para leer los iconos.");
        }

        try
        {
            for (var i = 0; i < count; i++)
            {
                SendMessage(listView, LVM_GETITEMPOSITION, new IntPtr(i), remote);
                var bytes = new byte[8];
                if (ReadProcessMemory(process, remote, bytes, bytes.Length, out _))
                {
                    result.Add(new IconPosition { Index = i, X = BitConverter.ToInt32(bytes, 0), Y = BitConverter.ToInt32(bytes, 4) });
                }
            }
        }
        finally
        {
            VirtualFreeEx(process, remote, UIntPtr.Zero, MEM_RELEASE);
            CloseHandle(process);
        }
        return result;
    }

    private static void SetPosition(IntPtr listView, int index, int x, int y)
    {
        var packed = ((long)(ushort)y << 16) | (ushort)x;
        SendMessage(listView, LVM_SETITEMPOSITION32, new IntPtr(index), new IntPtr(packed));
    }

    private static bool IsInside(int x, int y, RECT r)
        => x >= r.Left && x <= r.Right && y >= r.Top && y <= r.Bottom;

    private static string ReserveIcons(IntPtr widget, string statePath)
    {
        var listView = FindDesktopListView();
        if (listView == IntPtr.Zero) throw new InvalidOperationException("No se encontró la vista de iconos del escritorio.");

        IconLayoutState state;
        if (File.Exists(statePath))
        {
            state = JsonSerializer.Deserialize<IconLayoutState>(File.ReadAllText(statePath)) ?? new IconLayoutState();
        }
        else
        {
            state = new IconLayoutState
            {
                AutoArrange = IsAutoArrange(listView),
                Positions = ReadPositions(listView)
            };
            var dir = Path.GetDirectoryName(statePath);
            if (!string.IsNullOrWhiteSpace(dir)) Directory.CreateDirectory(dir);
            File.WriteAllText(statePath, JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true }));
        }

        if (state.Positions.Count == 0)
            return JsonSerializer.Serialize(new { moved = 0, message = "No hay iconos que acomodar." });

        if (IsAutoArrange(listView)) SetAutoArrange(listView, false);

        var currentCount = SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
        foreach (var p in state.Positions.Where(p => p.Index < currentCount))
            SetPosition(listView, p.Index, p.X, p.Y);

        if (!GetWindowRect(widget, out var widgetRect))
            throw new InvalidOperationException("No se pudo obtener el área del widget.");

        var points = new[]
        {
            new POINT { X = widgetRect.Left, Y = widgetRect.Top },
            new POINT { X = widgetRect.Right, Y = widgetRect.Bottom }
        };
        MapWindowPoints(IntPtr.Zero, listView, points, 2);

        var spacing = GetSpacing(listView);
        var forbidden = new RECT
        {
            Left = Math.Min(points[0].X, points[1].X) - spacing.X / 2,
            Top = Math.Min(points[0].Y, points[1].Y) - spacing.Y / 2,
            Right = Math.Max(points[0].X, points[1].X) + spacing.X / 2,
            Bottom = Math.Max(points[0].Y, points[1].Y) + spacing.Y / 2
        };

        GetClientRect(listView, out var client);
        var first = state.Positions[0];
        var anchorX = ((first.X % spacing.X) + spacing.X) % spacing.X;
        var anchorY = ((first.Y % spacing.Y) + spacing.Y) % spacing.Y;

        string CellKey(int x, int y)
        {
            var cx = (int)Math.Round((x - anchorX) / (double)spacing.X);
            var cy = (int)Math.Round((y - anchorY) / (double)spacing.Y);
            return cx + ":" + cy;
        }

        var blocked = new HashSet<string>(
            state.Positions.Where(p => !IsInside(p.X, p.Y, forbidden)).Select(p => CellKey(p.X, p.Y)));

        var candidates = new List<(int X, int Y)>();
        for (var y = anchorY; y < client.Bottom; y += spacing.Y)
        {
            for (var x = anchorX; x < client.Right; x += spacing.X)
            {
                if (x < client.Left || y < client.Top) continue;
                if (IsInside(x, y, forbidden)) continue;
                candidates.Add((x, y));
            }
        }

        var moved = 0;
        foreach (var p in state.Positions.Where(p => p.Index < currentCount && IsInside(p.X, p.Y, forbidden)))
        {
            (int X, int Y)? best = null;
            long bestDistance = long.MaxValue;
            foreach (var c in candidates)
            {
                var key = CellKey(c.X, c.Y);
                if (blocked.Contains(key)) continue;
                var dx = c.X - p.X;
                var dy = c.Y - p.Y;
                var distance = (long)dx * dx + (long)dy * dy;
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    best = c;
                }
            }

            if (best.HasValue)
            {
                SetPosition(listView, p.Index, best.Value.X, best.Value.Y);
                blocked.Add(CellKey(best.Value.X, best.Value.Y));
                moved++;
            }
        }

        return JsonSerializer.Serialize(new { moved, autoArrangeWasEnabled = state.AutoArrange });
    }

    private static string RestoreIcons(string statePath)
    {
        if (!File.Exists(statePath))
            return JsonSerializer.Serialize(new { restored = 0 });

        var listView = FindDesktopListView();
        if (listView == IntPtr.Zero) throw new InvalidOperationException("No se encontró la vista de iconos del escritorio.");

        var state = JsonSerializer.Deserialize<IconLayoutState>(File.ReadAllText(statePath)) ?? new IconLayoutState();
        var currentCount = SendMessage(listView, LVM_GETITEMCOUNT, IntPtr.Zero, IntPtr.Zero).ToInt32();
        var restored = 0;
        foreach (var p in state.Positions.Where(p => p.Index < currentCount))
        {
            SetPosition(listView, p.Index, p.X, p.Y);
            restored++;
        }
        SetAutoArrange(listView, state.AutoArrange);
        try { File.Delete(statePath); } catch {}
        return JsonSerializer.Serialize(new { restored });
    }

    private static int Main(string[] args)
    {
        if (args.Length < 6 || !long.TryParse(args[1], out var hwndValue)) return 64;
        if (!int.TryParse(args[2], out var x) || !int.TryParse(args[3], out var y) ||
            !int.TryParse(args[4], out var width) || !int.TryParse(args[5], out var height)) return 65;

        var hwnd = new IntPtr(hwndValue);
        var command = args[0].ToLowerInvariant();

        try
        {
            if (command == "attach")
            {
                var host = FindDesktopWorker();
                if (host == IntPtr.Zero) return 2;
                SetChildStyle(hwnd, true);
                SetParent(hwnd, host);
                SetWindowPos(hwnd, IntPtr.Zero, x, y, width, height,
                    SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
                Console.WriteLine("attached");
                return 0;
            }

            if (command == "detach")
            {
                SetParent(hwnd, IntPtr.Zero);
                SetChildStyle(hwnd, false);
                SetWindowPos(hwnd, IntPtr.Zero, x, y, width, height,
                    SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
                Console.WriteLine("detached");
                return 0;
            }

            if (command == "reserve-icons")
            {
                if (args.Length < 7) return 67;
                Console.WriteLine(ReserveIcons(hwnd, args[6]));
                return 0;
            }

            if (command == "restore-icons")
            {
                if (args.Length < 7) return 67;
                Console.WriteLine(RestoreIcons(args[6]));
                return 0;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 70;
        }

        return 66;
    }
}
