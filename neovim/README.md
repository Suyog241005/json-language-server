# Hyperjump - JSON Language Server - Neovim Configuration

When we're ready for people to start using this language server, we'll want to
add it to [lspconfig](https://github.com/neovim/nvim-lspconfig) and
[Mason](https://github.com/williamboman/mason.nvim) to make setup as easy as
possible. For now, installation is manual.

First checkout this repo locally and run `npm install`. This configuration
requires [plenary.nvim](https://github.com/nvim-lua/plenary.nvim). Then you can
configure Neovim to use that checkout to run the server. See
[`neovim/ftplugin/json.lua`](ftplugin/json.lua) for the configuration.
