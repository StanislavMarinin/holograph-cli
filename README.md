oclif-hello-world
=================

oclif example Hello World CLI

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/oclif-hello-world.svg)](https://npmjs.org/package/oclif-hello-world)
[![CircleCI](https://circleci.com/gh/oclif/hello-world/tree/main.svg?style=shield)](https://circleci.com/gh/oclif/hello-world/tree/main)
[![Downloads/week](https://img.shields.io/npm/dw/oclif-hello-world.svg)](https://npmjs.org/package/oclif-hello-world)
[![License](https://img.shields.io/npm/l/oclif-hello-world.svg)](https://github.com/oclif/hello-world/blob/main/package.json)

<!-- toc -->
* [Usage](#usage)
* [Commands](#commands)
<!-- tocstop -->
# Usage
<!-- usage -->
```sh-session
$ npm install -g holo-cli
$ holo COMMAND
running command...
$ holo (--version)
holo-cli/0.0.0 darwin-arm64 node-v17.2.0
$ holo --help [COMMAND]
USAGE
  $ holo COMMAND
...
```
<!-- usagestop -->
# Commands
<!-- commands -->
* [`holo hello PERSON`](#holo-hello-person)
* [`holo hello world`](#holo-hello-world)
* [`holo help [COMMAND]`](#holo-help-command)
* [`holo plugins`](#holo-plugins)
* [`holo plugins:install PLUGIN...`](#holo-pluginsinstall-plugin)
* [`holo plugins:inspect PLUGIN...`](#holo-pluginsinspect-plugin)
* [`holo plugins:install PLUGIN...`](#holo-pluginsinstall-plugin-1)
* [`holo plugins:link PLUGIN`](#holo-pluginslink-plugin)
* [`holo plugins:uninstall PLUGIN...`](#holo-pluginsuninstall-plugin)
* [`holo plugins:uninstall PLUGIN...`](#holo-pluginsuninstall-plugin-1)
* [`holo plugins:uninstall PLUGIN...`](#holo-pluginsuninstall-plugin-2)
* [`holo plugins update`](#holo-plugins-update)

## `holo hello PERSON`

Say hello

```
USAGE
  $ holo hello [PERSON] -f <value>

ARGUMENTS
  PERSON  Person to say hello to

FLAGS
  -f, --from=<value>  (required) Whom is saying hello

DESCRIPTION
  Say hello

EXAMPLES
  $ oex hello friend --from oclif
  hello friend from oclif! (./src/commands/hello/index.ts)
```

_See code: [dist/commands/hello/index.ts](https://github.com/cxip-labs/holo-cli/blob/v0.0.0/dist/commands/hello/index.ts)_

## `holo hello world`

Say hello world

```
USAGE
  $ holo hello world

DESCRIPTION
  Say hello world

EXAMPLES
  $ oex hello world
  hello world! (./src/commands/hello/world.ts)
```

## `holo help [COMMAND]`

Display help for holo.

```
USAGE
  $ holo help [COMMAND] [-n]

ARGUMENTS
  COMMAND  Command to show help for.

FLAGS
  -n, --nested-commands  Include all nested commands in the output.

DESCRIPTION
  Display help for holo.
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v5.1.10/src/commands/help.ts)_

## `holo plugins`

List installed plugins.

```
USAGE
  $ holo plugins [--core]

FLAGS
  --core  Show core plugins.

DESCRIPTION
  List installed plugins.

EXAMPLES
  $ holo plugins
```

_See code: [@oclif/plugin-plugins](https://github.com/oclif/plugin-plugins/blob/v2.0.11/src/commands/plugins/index.ts)_

## `holo plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ holo plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.

  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.

ALIASES
  $ holo plugins add

EXAMPLES
  $ holo plugins:install myplugin 

  $ holo plugins:install https://github.com/someuser/someplugin

  $ holo plugins:install someuser/someplugin
```

## `holo plugins:inspect PLUGIN...`

Displays installation properties of a plugin.

```
USAGE
  $ holo plugins:inspect PLUGIN...

ARGUMENTS
  PLUGIN  [default: .] Plugin to inspect.

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Displays installation properties of a plugin.

EXAMPLES
  $ holo plugins:inspect myplugin
```

## `holo plugins:install PLUGIN...`

Installs a plugin into the CLI.

```
USAGE
  $ holo plugins:install PLUGIN...

ARGUMENTS
  PLUGIN  Plugin to install.

FLAGS
  -f, --force    Run yarn install with force flag.
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Installs a plugin into the CLI.

  Can be installed from npm or a git url.

  Installation of a user-installed plugin will override a core plugin.

  e.g. If you have a core plugin that has a 'hello' command, installing a user-installed plugin with a 'hello' command
  will override the core plugin implementation. This is useful if a user needs to update core plugin functionality in
  the CLI without the need to patch and update the whole CLI.

ALIASES
  $ holo plugins add

EXAMPLES
  $ holo plugins:install myplugin 

  $ holo plugins:install https://github.com/someuser/someplugin

  $ holo plugins:install someuser/someplugin
```

## `holo plugins:link PLUGIN`

Links a plugin into the CLI for development.

```
USAGE
  $ holo plugins:link PLUGIN

ARGUMENTS
  PATH  [default: .] path to plugin

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Links a plugin into the CLI for development.

  Installation of a linked plugin will override a user-installed or core plugin.

  e.g. If you have a user-installed or core plugin that has a 'hello' command, installing a linked plugin with a 'hello'
  command will override the user-installed or core plugin implementation. This is useful for development work.

EXAMPLES
  $ holo plugins:link myplugin
```

## `holo plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ holo plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ holo plugins unlink
  $ holo plugins remove
```

## `holo plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ holo plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ holo plugins unlink
  $ holo plugins remove
```

## `holo plugins:uninstall PLUGIN...`

Removes a plugin from the CLI.

```
USAGE
  $ holo plugins:uninstall PLUGIN...

ARGUMENTS
  PLUGIN  plugin to uninstall

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Removes a plugin from the CLI.

ALIASES
  $ holo plugins unlink
  $ holo plugins remove
```

## `holo plugins update`

Update installed plugins.

```
USAGE
  $ holo plugins update [-h] [-v]

FLAGS
  -h, --help     Show CLI help.
  -v, --verbose

DESCRIPTION
  Update installed plugins.
```
<!-- commandsstop -->
