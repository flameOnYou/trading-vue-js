
// Script engine, Fuck yeah

import ScriptEnv from './script_env.js'
import Utils from '../stuff/utils.js'
import TS from './script_ts.js'

const DEF_LIMIT = 5   // default buff length
const WAIT_EXEC = 10  // merge script execs, ms

class ScriptEngine {

    constructor() {
        this.map = {}
        this.data = {}
        this.exec_id = null
        this.queue = []         // Script exec queue
        this.delta_queue = []   // Settings queue
        this.update_queue = []  // Live update queue
        this.sett = {}
        this.state = {}
    }

    exec_all() {

        clearTimeout(this.exec_id)

        // Wait for the data
        if (!this.data.ohlcv) return

        // Execute queue after all scripts & data are loaded
        this.exec_id = setTimeout(async () => {

            if (!this.init_state(Object.keys(this.map))) {
                return
            }
            this.re_init_map()

            while (this.queue.length) {
                this.exec(this.queue.shift())
            }

            if (Object.keys(this.map).length) {
                await this.run()
                this.drain_queues()
            }

            this.send_state()

        }, WAIT_EXEC)
    }

    // Exec selected
    async exec_sel(delta) {

        // Wait for the data
        if (!this.data.ohlcv) return

        let sel = Object.keys(delta).filter(x => x in this.map)

        if (!this.init_state(sel)) {
            this.delta_queue.push(delta)
            return
        }

        for (var id in delta) {
            if (!this.map[id]) continue

            let props = this.map[id].src.props
            for (var k in props) {
                if (k in delta[id]) {
                    props[k].val = delta[id][k]
                }
            }

            this.exec(this.map[id])

        }

        await this.run(sel)
        this.drain_queues()
        this.send_state()

    }

    // Exec script (create a new ScriptEnv, add to the map)
    exec(s) {

        if (!s.src.conf) s.src.conf = {}

        if (s.src.init) {
            s.src.init_src = this.get_raw_src(s.src.init)
        }
        if (s.src.update) {
            s.src.upd_src = this.get_raw_src(s.src.update)
        }

        s.env = new ScriptEnv(s, {
            open: this.open,
            high: this.high,
            low: this.low,
            close: this.close,
            vol: this.vol,
            ohlcv: this.data.ohlcv,
            t: () => this.t,
            iter: () => this.iter,
        })

        this.map[s.uuid] = s

    }

    // Live update
    update(candle) {

        if (!this.data.ohlcv || !this.data.ohlcv.length) {
            return
        }

        if (this.running) {
            this.update_queue.push(candle)
            return
        }

        try {
            let ohlcv = this.data.ohlcv
            let i = ohlcv.length - 1
            let last = ohlcv[i]
            let sel = Object.keys(this.map)
            let unshift = false

            if (candle[0] > last[0]) {
                ohlcv.push(candle)
                unshift = true
                i++
            } else if (candle[0] < last[0]) {
                return
            } else {
                ohlcv[i] = candle
            }

            this.iter = i
            this.t = ohlcv[i][0]
            this.step(ohlcv[i], unshift)

            for (var id of sel) {
                this.map[id].env.step(unshift)
            }
            this.limit()
            this.send_update()
            this.send_state()

        } catch(e) {
            console.log(e)
        }
    }

    init_state(sel) {

        let task = sel.join(',')

        // Stop previous run only if the task is the same
        if (this.running) {
            this._restart = (task === this.task)
            return false
        }

        // Inverted arrays
        this.open = TS('open', [])
        this.high = TS('high', [])
        this.low = TS('low', [])
        this.close = TS('close', [])
        this.vol = TS('vol', [])
        this.iter = 0
        this.t = 0
        this.skip = false // skip the step
        this.running = true
        this.task = task

        return true
    }

    send_state() {
        this.onmessage('engine-state', {
            scripts: Object.keys(this.map).length,
            last_perf: this.perf,
            iter: this.iter,
            last_t: this.t,
            running: false
        })
    }

    send_update() {
        this.onmessage(
            'overlay-update', this.format_update()
        )
    }

    re_init_map() {
        for (var id in this.map) {
            this.exec(this.map[id])
        }
    }

    get_raw_src(f) {
        if (typeof f === 'string') return f
        let src = f.toString()
        return src.slice(
            src.indexOf("{") + 1,
            src.lastIndexOf("}")
        )
    }

    async run(sel) {

        this.onmessage('engine-state', { running: true })

        var t1 = Utils.now()
        sel = sel || Object.keys(this.map)

        try {

            for (var id of sel) {
                this.map[id].env.init()
                this.init_conf(id)
            }

            let ohlcv = this.data.ohlcv
            let start = this.start(ohlcv)

            for (var i = start; i < ohlcv.length; i++) {

                // Make a pause to read new WW msg
                // TODO: speedup pause()
                if (i % 1000 === 0) await Utils.pause(0)
                if (this.restarted()) return

                this.iter = i - start
                this.t = ohlcv[i][0]
                this.step(ohlcv[i])

                // SLOW DOWN TEST:
                //for (var k = 1; k < 1000000; k++) {}

                for (var id of sel) this.map[id].env.step()

                this.limit()
            }
        } catch(e) {
            console.log(e)
        }

        this.perf = Utils.now() - t1
        //console.log('Perf',  this.perf)

        this.running = false

        this.onmessage('overlay-data', this.format_map(sel))
    }

    step(data, unshift = true) {
        if (unshift) {
            this.open.unshift(data[1])
            this.high.unshift(data[2])
            this.low.unshift(data[3])
            this.close.unshift(data[4])
            this.vol.unshift(data[5])
        } else {
            this.open[0] = data[1]
            this.high[0] = data[2]
            this.low[0] = data[3]
            this.close[0] = data[4]
            this.vol[0] = data[5]
        }
    }


    limit() {
        this.open.length = this.open.__len__ || DEF_LIMIT
        this.high.length = this.high.__len__ || DEF_LIMIT
        this.low.length = this.low.__len__ || DEF_LIMIT
        this.close.length = this.close.__len__ || DEF_LIMIT
        this.vol.length = this.vol.__len__ || DEF_LIMIT
    }

    start(ohlcv) {
        let depth = this.sett.script_depth
        return depth ?
            Math.max(ohlcv.length - depth, 0) : 0
    }

    drain_queues() {

        // Check if there are any new scripts (recieved during
        // the current run)
        if (this.queue.length) {
            this.exec_all()
        }
        // Check if there are any new settings deltas (...)
        else if (this.delta_queue.length) {
            this.exec_sel(this.delta_queue.pop())
            this.delta_queue = []
        }
        else {
            while (this.update_queue.length) {
                let c = this.update_queue.shift()
                this.update(c)
            }
        }
    }

    format_map(sel) {
        sel = sel || Object.keys(this.map)
        let res = []
        for (var id of sel) {
            let x = this.map[id]
            res.push({ id: id, data: x.env.data })
        }
        return res
    }

    format_update() {
        let res = []
        for (var id in this.map) {
            let x = this.map[id]
            res.push({
                id: id,
                data: x.env.data[x.env.data.length - 1]
            })
        }
        return res
    }

    init_conf(id) {
        /*if (this.map[id].src.conf.renderer) {
            this.onmessage('change-overlay', {
                id: id,
                fileds: {
                    type: this.map[id].src.conf.renderer
                }
            })
        }*/
    }

    restarted() {
        if (this._restart) {
            this._restart = false
            this.running = false
            this.perf = 0
            //console.log('Restarted')
            return true
        }
        return false
    }

    remove_scripts(ids) {
        for (var id of ids) delete this.map[id]
        this.send_state()
    }
}

export default new ScriptEngine()
