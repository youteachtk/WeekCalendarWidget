using System;
using System.Runtime.InteropServices;
using System.Threading;

internal static class Program
{
    private const uint WM_SPAWN_WORKER = 0x052C;
    private const uint SMTO_NORMAL = 0x0000;
    private const uint GW_HWNDNEXT = 2;
    private const int GWL_EXSTYLE = -20;
    private const long WS_EX_TOOLWINDOW = 0x00000080L;
    private const long WS_EX_APPWINDOW = 0x00040000L;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_SHOWWINDOW = 0x0040;

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    private struct POINT { public int X, Y; }

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindow(string? lpClassName, string? lpWindowName);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr FindWindowEx(IntPtr parent, IntPtr childAfter, string? className, string? windowName);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool EnumWindows(EnumWindowsProc enumFunc, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool ScreenToClient(IntPtr hWnd, ref POINT point);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int x, int y, int cx, int cy, uint flags);

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam, uint flags, uint timeout, out IntPtr result);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr64(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr64(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    private static long GetExStyle(IntPtr hWnd) => GetWindowLongPtr64(hWnd, GWL_EXSTYLE).ToInt64();
    private static void SetExStyle(IntPtr hWnd, long style) => SetWindowLongPtr64(hWnd, GWL_EXSTYLE, new IntPtr(style));

    private static IntPtr FindWallpaperWorker()
    {
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            SendMessageTimeout(progman, WM_SPAWN_WORKER, IntPtr.Zero, IntPtr.Zero, SMTO_NORMAL, 1200, out _);
            Thread.Sleep(120);
        }

        IntPtr worker = IntPtr.Zero;
        EnumWindows((top, _) =>
        {
            var shellView = FindWindowEx(top, IntPtr.Zero, "SHELLDLL_DefView", null);
            if (shellView != IntPtr.Zero)
            {
                var candidate = FindWindowEx(IntPtr.Zero, top, "WorkerW", null);
                if (candidate != IntPtr.Zero)
                {
                    worker = candidate;
                    return false;
                }
            }
            return true;
        }, IntPtr.Zero);

        if (worker == IntPtr.Zero)
        {
            IntPtr current = IntPtr.Zero;
            while ((current = FindWindowEx(IntPtr.Zero, current, "WorkerW", null)) != IntPtr.Zero)
            {
                if (FindWindowEx(current, IntPtr.Zero, "SHELLDLL_DefView", null) == IntPtr.Zero)
                    worker = current;
            }
        }

        return worker != IntPtr.Zero ? worker : progman;
    }

    private static int Attach(IntPtr hwnd)
    {
        if (!GetWindowRect(hwnd, out var before)) return 4;
        var parent = FindWallpaperWorker();
        if (parent == IntPtr.Zero) return 5;

        var point = new POINT { X = before.Left, Y = before.Top };
        ScreenToClient(parent, ref point);

        SetParent(hwnd, parent);
        var style = GetExStyle(hwnd);
        style = (style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
        SetExStyle(hwnd, style);
        SetWindowPos(hwnd, IntPtr.Zero, point.X, point.Y, before.Right-before.Left, before.Bottom-before.Top,
            SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
        Console.WriteLine("attached");
        return 0;
    }

    private static int Detach(IntPtr hwnd)
    {
        if (!GetWindowRect(hwnd, out var before)) return 6;
        SetParent(hwnd, IntPtr.Zero);
        var style = GetExStyle(hwnd);
        style = (style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW;
        SetExStyle(hwnd, style);
        SetWindowPos(hwnd, IntPtr.Zero, before.Left, before.Top, before.Right-before.Left, before.Bottom-before.Top,
            SWP_NOACTIVATE | SWP_FRAMECHANGED | SWP_SHOWWINDOW);
        Console.WriteLine("detached");
        return 0;
    }

    public static int Main(string[] args)
    {
        try
        {
            if (args.Length < 2) return 2;
            var command = args[0].ToLowerInvariant();
            if (!long.TryParse(args[1], out var raw)) return 3;
            var hwnd = new IntPtr(raw);
            return command switch
            {
                "attach" => Attach(hwnd),
                "detach" => Detach(hwnd),
                _ => 2
            };
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex.Message);
            return 10;
        }
    }
}
