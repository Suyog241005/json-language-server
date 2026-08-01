local root_files = { ".git", "package.json" }
local paths = vim.fs.find(root_files, { stop = vim.env.HOME })

vim.lsp.start({
  name = "hyperjump-json-language-server",
  cmd = { "node", "../json-language-server/language-server/src/server.ts", "--stdio" },
  root_dir = vim.fs.dirname(paths[1]),
  settings = {
    jsonLanguageServer = {
      -- Put any settings here
    }
  }
})

local ok, scandir = pcall(require, "plenary.scandir")

vim.lsp.handlers["hyperjump/readFile"] = function(_, params, _)
  local f = assert(io.open(vim.uri_to_fname(params.uri), "rb"), "File not found")
  local content = f:read("*a")
  f:close()
  return content
end

vim.lsp.handlers["hyperjump/findFiles"] = function(_, params, _)
  assert(ok, "hyperjump/findFiles requires plenary.nvim (https://github.com/nvim-lua/plenary.nvim). Install it and restart Neovim.")
  local root = assert(vim.uv.cwd(), "hyperjump/findFiles: cwd is not set")

  local include = vim.glob.to_lpeg(params.include)
  local exclude = params.exclude and vim.glob.to_lpeg(params.exclude)

  local matches = scandir.scan_dir(root, {
    respect_gitignore = true,
    hidden = true,
    silent = true,
    search_pattern = function(entry)
      local rel = vim.fs.relpath(root, entry)
      return rel ~= nil and not vim.startswith(rel, ".git/") and include:match(rel) ~= nil and (exclude == nil or exclude:match(rel) == nil)
    end,
  })

  return vim.tbl_map(vim.uri_from_fname, vim.list_slice(matches, 1, params.maxResults))
end
