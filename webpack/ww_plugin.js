
// Plugin for saving compiled webworker
// for further use as a Blob content (see script_ww_api.js)

const http = require('http')
const fs = require('fs')
const { minify } = require("terser")

const PATH = `./src/helpers/tmp/`

module.exports = class WWPlugin {
    apply(compiler) {
        compiler.hooks.afterEmit.tap('AfterEmitPlugin', (compilation) => {
            http.get(`http://localhost:${port}/main.worker.js`, resp => {
                let data = ''

                resp.on('data', (chunk) => {
                    data += chunk
                })

                resp.on('end', () => {
                    //data = minify(data, { sourceMap: false }).code
                    let json = JSON.stringify([data])
                    try {
                        var prev = fs.readFileSync(PATH + 'ww$$$.json')
                    } catch(e) {}

                    // Write new compiled ww only if the src changed
                    if (json != prev) {
                        fs.writeFileSync(PATH + 'ww$$$.json', json)
                    }
                })

                }).on("error", (err) => {
                    console.log("Error: " + err.message)
                })
        })
    }
}
