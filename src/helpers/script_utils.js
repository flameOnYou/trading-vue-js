
const FDEFS = /(function |)([$A-Z_][0-9A-Z_$\.]*)[\s]*?\((.*?)\)/gmi
const SBRACKETS = /([$A-Z_][0-9A-Z_$\.]*)[\s]*?\[([^"^\[^\]]+?)\]/gmi

const BUF_INC = 5

export function f_args(src) {
    FDEFS.lastIndex = 0

    var m = FDEFS.exec(src)
    if (m) {
        let fkeyword = m[1].trim()
        let fname = m[2].trim()
        let fargs = m[3].trim()

        return fargs.split(',').map(x => x.trim())
    }
    return []
}

export function f_body(src) {
    return src.slice(
        src.indexOf("{") + 1,
        src.lastIndexOf("}")
    )
}

export function wrap_idxs(src, pre = '') {

    SBRACKETS.lastIndex = 0
    let changed = false

    do {
        var m = SBRACKETS.exec(src)

        if (m) {

            let vname = m[1].trim()
            let vindex = m[2].trim()
            if (vindex === '0' || parseInt(vindex) < BUF_INC) {
                continue
            }
            switch(vname) {
                case 'let':
                case 'var':
                case 'return':
                    continue
            }

            //let wrap = `${pre}_v(${vname}, ${vindex})[${vindex}]`
            let wrap = `${vname}[${pre}_i(${vindex}, ${vname})]`
            src = src.replace(m[0], wrap)
            changed = true
        }
    } while (m)

    return changed ? src : src
}
