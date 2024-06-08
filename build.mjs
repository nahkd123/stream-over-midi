import * as esbuild from "esbuild";

const options = {
    bundle: true,
    format: "esm",
    outfile: "www/bundle.js",
    entryPoints: ["src/index.ts"],
    sourcemap: "inline"
};

if (process.argv[2] == "gh-pages") {
    console.log("Building for GitHub pages...");
    esbuild.buildSync(options);
    console.log("Done!");
} else {
    const context = await esbuild.context(options);
    await context.watch();
    await context.serve({ servedir: "www", port: 8080, host: "0.0.0.0" });
    console.log("http://127.0.0.1:8080");
}