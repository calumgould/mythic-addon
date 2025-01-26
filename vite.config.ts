import { defineConfig, Plugin } from "vite";
import copy from "rollup-plugin-copy";
import * as fsPromises from "fs/promises";

const updateModuleManifestPlugin = (): Plugin => {
    return {
        name: "update-module-manifest",
        async writeBundle(): Promise<void> {
            const moduleVersion = process.env.MODULE_VERSION;
            const githubProject = process.env.GH_PROJECT;
            const githubTag = process.env.GH_TAG;

            const manifestContents: string = await fsPromises.readFile(
                "src/module.json",
                "utf-8"
              );

              const manifestJson = JSON.parse(manifestContents) as Record<
                string,
                unknown
              >;

              if (moduleVersion) {
                manifestJson["version"] = moduleVersion;
              }

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
        updateModuleManifestPlugin(),
        copy({
          targets: [
            { src: "src/lang", dest: "dist" },
            { src: "src/packs", dest: "dist" },
            { src: "src/styles", dest: "dist" },
            { src: "src/templates", dest: "dist" },
          ],
          hook: "writeBundle",
        }),
      ],
});
