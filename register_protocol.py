"""
register_protocol.py
────────────────────
Registers the `edulens://` custom URI scheme with the operating system so
that any browser or web page can launch main.py via a link like:

    edulens://launch?category=UIUX&student_id=abc&mentor_id=xyz

Platform support
────────────────
  macOS   — creates a minimal AppleScript .app bundle whose `open location`
             handler receives the URL from Launch Services and forwards it to
             main.py as sys.argv[1].  Registered with `lsregister`.

  Windows — writes HKCU\\Software\\Classes\\edulens registry keys that
             instruct the OS to call  python.exe main.py "%1"  when the
             scheme is opened.

  Linux   — creates a .desktop file in ~/.local/share/applications and
             registers it with `xdg-mime`.

Usage
─────
  python3 register_protocol.py           # register
  python3 register_protocol.py --remove  # unregister

After registering on macOS you may need to relaunch your browser once.
On Windows the change takes effect immediately for new browser tabs.
"""

import os
import sys
import shutil
import subprocess
import textwrap
from pathlib import Path

# ── Constants ─────────────────────────────────────────────────────────────────

SCHEME   = "edulens"
APP_NAME = "EduLens"
MAIN_PY  = Path(__file__).with_name("main.py").resolve()
PYTHON   = Path(sys.executable).resolve()
HERE     = Path(__file__).parent.resolve()

# ── macOS ─────────────────────────────────────────────────────────────────────

APP_BUNDLE = HERE / f"{APP_NAME}.app"

# The AppleScript source.  The `open location` handler is called by Launch
# Services whenever a browser navigates to an edulens:// URL.  It shells out
# to Python, passing the URL as the first argument so main.py can read it
# from sys.argv[1].
_APPLESCRIPT = """\
on open location this_URL
    do shell script "{python}" & space & {main_py_quoted} & space & quoted form of this_URL
end open location

-- Also handle direct launches (no URL) so the app icon is openable.
on run
    do shell script "{python}" & space & {main_py_quoted}
end run
"""

# Minimal Info.plist that declares the edulens:// URL scheme.
_INFO_PLIST = """\
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>{app_name}</string>
    <key>CFBundleDisplayName</key>
    <string>{app_name}</string>
    <key>CFBundleIdentifier</key>
    <string>com.edulens.launcher</string>
    <key>CFBundleVersion</key>
    <string>1.0</string>
    <key>CFBundleExecutable</key>
    <string>applet</string>
    <key>CFBundleURLTypes</key>
    <array>
        <dict>
            <key>CFBundleURLName</key>
            <string>EduLens Protocol</string>
            <key>CFBundleURLSchemes</key>
            <array>
                <string>{scheme}</string>
            </array>
        </dict>
    </array>
    <!-- LSUIElement=true hides the Dock icon — this is a background launcher -->
    <key>LSUIElement</key>
    <true/>
</dict>
</plist>
"""

_LSREGISTER = (
    "/System/Library/Frameworks/CoreServices.framework"
    "/Frameworks/LaunchServices.framework/Support/lsregister"
)


def _register_macos(remove: bool) -> None:
    if remove:
        if APP_BUNDLE.exists():
            shutil.rmtree(APP_BUNDLE)
            print(f"Removed {APP_BUNDLE}")
        # Tell Launch Services to forget the bundle registration.
        subprocess.run([_LSREGISTER, "-u", str(APP_BUNDLE)], check=False)
        print("edulens:// scheme unregistered.")
        return

    # ── 1. Compile an AppleScript applet via osacompile ───────────────────
    # We write the source to a temp .applescript file, compile it into the
    # .app bundle, then patch the Info.plist with our URL scheme declaration.
    script_src = _APPLESCRIPT.format(
        python=str(PYTHON),
        # osacompile doesn't evaluate variables, so embed the literal path.
        main_py_quoted=_applescript_quote(str(MAIN_PY)),
    )

    tmp_script = HERE / "_edulens_handler.applescript"
    tmp_script.write_text(script_src, encoding="utf-8")

    try:
        result = subprocess.run(
            ["osacompile", "-o", str(APP_BUNDLE), str(tmp_script)],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"[Error] osacompile failed:\n{result.stderr.strip()}")
            sys.exit(1)
    finally:
        tmp_script.unlink(missing_ok=True)

    # ── 2. Overwrite Info.plist with the URL scheme declaration ───────────
    plist_path = APP_BUNDLE / "Contents" / "Info.plist"
    plist_path.write_text(
        _INFO_PLIST.format(app_name=APP_NAME, scheme=SCHEME),
        encoding="utf-8",
    )

    # ── 3. Register with Launch Services ─────────────────────────────────
    reg = subprocess.run(
        [_LSREGISTER, "-f", str(APP_BUNDLE)],
        capture_output=True,
        text=True,
    )
    if reg.returncode != 0:
        print(f"[Warning] lsregister returned {reg.returncode}: {reg.stderr.strip()}")
    else:
        print(f"Registered {APP_BUNDLE} with Launch Services.")

    print(
        f"\nDone. '{SCHEME}://' URLs will now launch {APP_NAME}.\n"
        "You may need to quit and relaunch your browser for the change to take effect.\n"
        f"Test with:  open '{SCHEME}://launch?category=GENERAL&student_id=test'"
    )


def _applescript_quote(path: str) -> str:
    """Return an AppleScript string literal for the given path."""
    # Escape any embedded quotes (rare but possible on unusual paths)
    escaped = path.replace('"', '\\"')
    return f'"{escaped}"'


# ── Windows ───────────────────────────────────────────────────────────────────

def _register_windows(remove: bool) -> None:
    import winreg  # noqa: PLC0415  (Windows-only stdlib module)

    root_key = rf"Software\Classes\{SCHEME}"

    if remove:
        for sub in [
            rf"{root_key}\shell\open\command",
            rf"{root_key}\shell\open",
            rf"{root_key}\shell",
            root_key,
        ]:
            try:
                winreg.DeleteKey(winreg.HKEY_CURRENT_USER, sub)
            except FileNotFoundError:
                pass
        print(f"Removed HKCU\\{root_key}")
        print("edulens:// scheme unregistered.")
        return

    # HKCU\Software\Classes\edulens  (root key)
    with winreg.CreateKey(winreg.HKEY_CURRENT_USER, root_key) as k:
        winreg.SetValueEx(k, "",              0, winreg.REG_SZ, "URL:EduLens Protocol")
        winreg.SetValueEx(k, "URL Protocol",  0, winreg.REG_SZ, "")

    # HKCU\Software\Classes\edulens\shell\open\command
    # The OS replaces %1 with the full edulens:// URI when the scheme is opened.
    cmd = f'"{PYTHON}" "{MAIN_PY}" "%1"'
    with winreg.CreateKey(
        winreg.HKEY_CURRENT_USER, rf"{root_key}\shell\open\command"
    ) as k:
        winreg.SetValueEx(k, "", 0, winreg.REG_SZ, cmd)

    print(f"Registered HKCU\\{root_key}")
    print(f"  Command: {cmd}")
    print(
        f"\nDone. '{SCHEME}://' URLs will now launch main.py.\n"
        "The change takes effect immediately (no browser restart needed).\n"
        f"Test by pasting this in the browser address bar:\n"
        f"  {SCHEME}://launch?category=GENERAL&student_id=test"
    )


# ── Linux ─────────────────────────────────────────────────────────────────────

_DESKTOP_ENTRY = """\
[Desktop Entry]
Name={app_name}
Comment=EduLens desktop learning agent
Exec={python} {main_py} %u
Type=Application
NoDisplay=true
MimeType=x-scheme-handler/{scheme};
"""


def _register_linux(remove: bool) -> None:
    apps_dir     = Path.home() / ".local/share/applications"
    desktop_file = apps_dir / f"{SCHEME}-handler.desktop"

    if remove:
        desktop_file.unlink(missing_ok=True)
        subprocess.run(
            ["xdg-mime", "default", "", f"x-scheme-handler/{SCHEME}"],
            check=False,
        )
        print(f"Removed {desktop_file}")
        print("edulens:// scheme unregistered.")
        return

    apps_dir.mkdir(parents=True, exist_ok=True)
    desktop_file.write_text(
        _DESKTOP_ENTRY.format(
            app_name=APP_NAME,
            python=str(PYTHON),
            main_py=str(MAIN_PY),
            scheme=SCHEME,
        ),
        encoding="utf-8",
    )

    subprocess.run(
        ["xdg-mime", "default", desktop_file.name, f"x-scheme-handler/{SCHEME}"],
        check=True,
    )
    # Refresh the MIME database so the .desktop file is discovered immediately.
    subprocess.run(["update-desktop-database", str(apps_dir)], check=False)

    print(f"Created {desktop_file}")
    print(
        f"\nDone. '{SCHEME}://' URLs will now launch main.py.\n"
        f"Test with:  xdg-open '{SCHEME}://launch?category=GENERAL&student_id=test'"
    )


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    remove = "--remove" in sys.argv or "-r" in sys.argv
    action = "Unregistering" if remove else "Registering"
    print(f"{action} '{SCHEME}://' URI scheme handler…")
    print(f"  Python  : {PYTHON}")
    print(f"  main.py : {MAIN_PY}\n")

    if not MAIN_PY.exists():
        print(f"[Error] main.py not found at {MAIN_PY}")
        sys.exit(1)

    if sys.platform == "darwin":
        _register_macos(remove)
    elif sys.platform == "win32":
        _register_windows(remove)
    elif sys.platform.startswith("linux"):
        _register_linux(remove)
    else:
        print(f"[Error] Unsupported platform: {sys.platform}")
        sys.exit(1)


if __name__ == "__main__":
    main()
