
// Web-worker

import se from './script_engine.js'
import Utils from '../stuff/utils.js'

var data_requested = false

// DC => WW

self.onmessage = async e => {
    //console.log('Worker got:', e.data.type)
    switch(e.data.type) {

        case 'update-dc-settings':

            se.sett = e.data.data

            break

        case 'exec-script':

            if (!se.data.ohlcv && !data_requested) {
                data_requested = true
                self.postMessage({ type: 'request-data' })
            }

            se.queue.push(e.data.data)
            se.exec_all()

            break

        case 'exec-all-scripts':

            if (!se.data.ohlcv && !data_requested) {
                data_requested = true
                self.postMessage({ type: 'request-data' })
            }

            se.exec_all()

            break

        case 'upload-data':

            if (e.data.data.ohlcv) {
                self.postMessage({ type: 'data-uploaded' })

                await Utils.pause(1)

                se.data.ohlcv = e.data.data.ohlcv
                data_requested = false
                se.exec_all()
            }

            break

        case 'update-data':

            if (e.data.data.ohlcv) {

                se.update(e.data.data.ohlcv)

            }

            break

        case 'update-ov-settings':

            se.exec_sel(e.data.data)

            break

        case 'remove-scripts':

            se.remove_scripts(e.data.data)

            break
    }

}

// WW => DC

se.onmessage = (type, data) => {

    switch(type) {

        case 'overlay-data':
        case 'overlay-update':
        case 'engine-state':
        case 'change-overlay':

            self.postMessage({type, data})

            break

    }

}
