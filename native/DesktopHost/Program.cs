using System;
using System.Runtime.InteropServices;

internal static class Program
{
    private const int GWL_STYLE = -16;
    private const long WS_CHILD = 0x40000000L;
    private const long WS_POPUP = unchecked((long)0x80000000L);
    private const uint WM_SPAWN_WORKER = 0x052C;
    private const uint SMTO_NORMAL = 0x0000;
    private const uint SWP_NOZORDER = 0x0004;
    private const uint SWP_NOACTIVATE = 0x0010;
    private const uint SWP_FRAMECHANGED = 0x0020;
    private const uint SWP_SHOWWINDOW = 0x0040;

    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

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

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetParent(IntPtr hWndChild, IntPtr hWndNewParent);

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW", SetLastError = true)]
    private static extern IntPtr SetWindowLongPtr(IntPtr hWnd, int nIndex, IntPtr dwNewLong);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);

    private static IntPtr FindDesktopWorker()
    {
        var progman = FindWindow("Progman", null);
        if (progman != IntPtr.Zero)
        {
            SendMessageTimeout(progman, WM_SPAWN_WORKER, IntPtr.Zero, IntPtr.Zero, SMTO_NORMAL, 1000, out _);
        }

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

    private static void SetChildStyle(IntPtr hwnd, bool child)
    {
        var style = GetWindowLongPtr(hwnd, GWL_STYLE).ToInt64();
        if (child)
        {
            style &= ~WS_POPUP;
            style |= WS_CHILD;
        }
        else
        {
            style &= ~WS_CHILD;
            style |= WS_POPUP;
        }
        SetWindowLongPtr(hwnd, GWL_STYLE, new IntPtr(style));
    }

    private static int Main(string[] args)
    {
        if (args.Length < 6 || !long.TryParse(args[1], out var hwndValue)) return 64;
        if (!int.TryParse(args[2], out var x) || !int.TryParse(args[3], out var y) ||
            !int.TryParse(args[4], out var width) || !int.TryParse(args[5], out var height)) return 65;

        var hwnd = new IntPtr(hwndValue);
        var command = args[0].ToLowerInvariant();

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

        return 66;
    }
}
