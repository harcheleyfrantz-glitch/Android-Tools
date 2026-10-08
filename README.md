AndroidModKit

AndroidModKit is an open-source toolkit focused on Android development, Termux workflows, and game modding.

The goal is to make development and modding tasks that are difficult or fragmented on Android easier to perform directly from a mobile device.

🚧 Project Status

AndroidModKit is currently in early development.

The project is being built incrementally, starting with a lightweight command-line toolkit and expanding toward more advanced Android modding and development features.

Features

Planned and developing features include:

- Android environment detection and diagnostics
- Termux environment tools
- Development environment checks
- Mod and project inspection
- Game-modding utilities
- Script inspection and tooling
- Android-focused developer workflows
- Plugin support for game-specific tools

Example

amk doctor

Checks the Android and Termux environment and reports potential problems.

amk info

Displays useful information about the current development environment.

amk mod inspect <file>

Inspects a mod or project file and provides information about its contents.

Goals

Android development can require complicated setups, especially when working through Termux or trying to build and manage game mods entirely from a phone.

AndroidModKit aims to provide a simple, modular toolkit that brings more of these workflows directly to Android.

The project is designed to remain lightweight and extensible rather than becoming a large, platform-specific development environment.

Roadmap

Phase 1

- [ ] Initial CLI
- [ ] Android environment detection
- [ ] Termux detection
- [ ] "doctor" command
- [ ] "info" command
- [ ] Basic testing

Phase 2

- [ ] Mod inspection
- [ ] Project management
- [ ] Backup and restore utilities
- [ ] Improved Android tooling

Phase 3

- [ ] Script tooling
- [ ] CLEO-related tooling
- [ ] Game-specific integrations
- [ ] Plugin system

Future

A dedicated Android graphical interface may eventually be developed on top of the core toolkit.

Contributing

Contributions, bug reports, feature requests, and improvements are welcome.

Please open an issue before making major changes so development can stay organized.

License

AndroidModKit is released under the MIT License.

See "LICENSE" (LICENSE) for the full license text.

Disclaimer

AndroidModKit is an independent open-source project.

It is not affiliated with or endorsed by Google, Termux, Rockstar Games, or any other third-party project or company referenced by the toolkit.
