import { defineConfig, Plugin } from "vite";
import copy from "rollup-plugin-copy";
import * as fsPromises from "fs/promises";
import fs from 'fs-extra'

const moduleVersion = process.env.MODULE_VERSION;
const githubProject = process.env.GH_PROJECT;
const githubTag = process.env.GH_TAG;

// Vite doesn't clean the build folder by default, so we need to do it ourselves
const cleanBuild = () => {
  return {
    name: 'clean-build',
    buildStart() {
      fs.emptyDirSync('dist')
    }
  }
}

const updateModuleManifestPlugin = (): Plugin => {
    return {
        name: "update-module-manifest",
        async writeBundle(): Promise<void> {
            const packageContents = JSON.parse(
                await fsPromises.readFile("./package.json", "utf-8")
              ) as Record<string, unknown>;

              const version = moduleVersion || (packageContents.version as string);

              const manifestContents: string = await fsPromises.readFile(
                "src/module.json",
                "utf-8"
              );

              const manifestJson = JSON.parse(manifestContents) as Record<
                string,
                unknown
              >;

              manifestJson["version"] = version;

              if (githubProject) {
                const baseUrl = `https://github.com/${githubProject}/releases`;

                manifestJson["manifest"] = `${baseUrl}/latest/download/module.json`;

                if (githubTag) {
                  manifestJson[
                    "download"
                  ] = `${baseUrl}/download/${githubTag}/module.zip`;
                }
              }

              await fsPromises.writeFile(
                "dist/module.json",
                JSON.stringify(manifestJson, null, 4)
              );
        }
    }
}

export default defineConfig({
    build: {
        sourcemap: true,
        rollupOptions: {
            input: "src/scripts/module.ts",
            output: {
                dir: "dist/scripts",
                entryFileNames: "module.js",
                format: "es",
            },
        },
    },
    plugins: [
        cleanBuild(),
        updateModuleManifestPlugin(),
        copy({
          targets: [
            { src: "src/lang", dest: "dist" },
            { src: "src/packs", dest: "dist" },
            { src: "src/styles", dest: "dist" },
            { src: "src/templates", dest: "dist" },
            { src: "src/scripts/macros", dest: "dist/scripts" }
          ],
          hook: "writeBundle",
        }),
      ],
});
