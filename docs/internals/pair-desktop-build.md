# Private Pair Desktop Build

The Pair desktop flavor installs next to the official T3 Code Nightly application. It must never
reuse the official application identity or state directories.

## Identity

| Setting            | Pair value                |
| ------------------ | ------------------------- |
| Product name       | `T3 Code Pair (Nightly)`  |
| macOS bundle ID    | `com.hcaiano.t3code.pair` |
| Renderer protocol  | `t3code-pair`             |
| Electron user data | `t3code-pair`             |
| T3 home            | `~/.t3-pair`              |
| Build output       | `release-pair`            |

The flavor has no publish feed and disables automatic updates. It also removes Clerk, relay, CLI
OAuth, and passkey configuration from the packaged client. Local connections, LAN access, and
Tailscale remain available.

Never point the Pair build at `~/.t3/userdata`. The official application can use that SQLite
database at the same time.

## Build and Install on Apple Silicon

Install dependencies, then run:

```sh
./node_modules/.bin/vp run dist:desktop:dmg:pair:arm64
```

The artifact is written to:

```text
release-pair/T3-Code-Pair-<version>-arm64.dmg
```

Open the DMG and drag **T3 Code Pair (Nightly)** to **Applications**. The local build uses an ad-hoc
signature and is not notarized, so use right-click, **Open** if macOS blocks the first launch.

## Keep the Fork Current

Use the public fork as `origin` and the official repository as `upstream`:

```sh
git remote add upstream https://github.com/pingdotgg/t3code.git
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main
git switch pair
git rebase upstream/main
git push --force-with-lease origin pair
```

Run the focused Pair tests and build a new DMG after each rebase. Install the new Pair application
over the previous Pair application. Do not install it over the official Nightly application.

The official Nightly continues to update through its normal in-app update button. The Pair build has
no automatic updater. Update it with the commands above, rebuild the DMG, and install that DMG over
the previous Pair build.

The Pair flavor does not create or require a pull request in the official repository.
