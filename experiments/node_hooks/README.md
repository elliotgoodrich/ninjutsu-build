This tests out using import and require hooks to see under which circumstances each are used and on what threads:

`node --import ./hookImport.mjs --require ./hookRequire.mjs ./index.mjs`
`node --import ./hookImport.mjs --require ./hookRequire.mjs ./index.cjs`
