import { defineConfig, Plugin } from 'vite'
import copy from 'rollup-plugin-copy'
import * as fsPromises from 'fs/promises'
import fs from 'fs-extra'
import path from 'path'

const moduleVersion = process.env.MODULE_VERSION
const githubProject = process.env.GH_PROJECT
const githubTag = process.env.GH_TAG

// Vite doesn't clean the build folder by default, so we need to do it ourselves
const cleanBuild = () => {
  return {
    name: 'clean-build',
    buildStart() {
      fs.emptyDirSync('dist')
    },
  }
}

const updateModuleManifestPlugin = (): Plugin => {
  return {
    name: 'update-module-manifest',
    async writeBundle(): Promise<void> {
      const packageContents = JSON.parse(await fsPromises.readFile('./package.json', 'utf-8')) as Record<string, unknown>

      const version = moduleVersion || (packageContents.version as string)

      const manifestContents: string = await fsPromises.readFile('src/module.json', 'utf-8')

      const manifestJson = JSON.parse(manifestContents) as Record<string, unknown>

      manifestJson['version'] = version

      if (githubProject) {
        const baseUrl = `https://github.com/${githubProject}/releases`

        manifestJson['manifest'] = `${baseUrl}/latest/download/module.json`

        if (githubTag) {
          manifestJson['download'] = `${baseUrl}/download/${githubTag}/module.zip`
        }
      }

      await fsPromises.writeFile('dist/module.json', JSON.stringify(manifestJson, null, 4))
    },
  }
}

const flattenMacrosPlugin = (): Plugin => {
  return {
    name: 'flatten-macros',
    apply: 'build',
    enforce: 'post',
    async closeBundle() {
      const srcPath = path.resolve('src/packs/macros-mythic.json')
      const destDir = path.resolve('dist/packs')
      const destPath = path.join(destDir, 'macros-mythic.db')

      try {
        const data = await fs.readFile(srcPath, 'utf-8')
        const json = JSON.parse(data)

        await fs.mkdir(destDir)

        const lines = json.map((entry: object) => JSON.stringify(entry)).join('\n')

        await fs.writeFile(destPath, lines, 'utf-8')
        console.log(`Flattened macros to ${destPath}`)
      } catch (err) {
        console.error('Failed to flatten macros:', err)
      }
    },
  }
}

export default defineConfig({
  build: {
    sourcemap: true,
    rollupOptions: {
      input: 'src/scripts/module.ts',
      output: {
        dir: 'dist/scripts',
        entryFileNames: 'module.js',
        format: 'es',
      },
    },
  },
  plugins: [
    cleanBuild(),
    updateModuleManifestPlugin(),
    flattenMacrosPlugin(),
    copy({
      targets: [
        { src: 'src/assets', dest: 'dist' },
        { src: 'src/lang', dest: 'dist' },
        { src: 'src/styles', dest: 'dist' },
        { src: 'src/templates', dest: 'dist' },
        { src: 'src/scripts/macros', dest: 'dist/scripts' },
      ],
      hook: 'writeBundle',
    }),
  ],
})
