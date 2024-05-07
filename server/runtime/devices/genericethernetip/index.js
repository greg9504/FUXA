/**
 * 'genericethernetip': uses st-ethernet-ip to communicate with generic ethernet-ip devices using
 * explicit and implicit messaging.  Also provides Browse functionality to list found ethernet-ip 
 * devices on the local network.
 */

'use strict';
var STEthernetIp;
const utils = require('../../utils');
const deviceUtils = require('../device-utils');

const EnipTagType = {//EnipTagDataSourceType
    symbolic: 0,
    explicit: 1,
    assemblyIO: 2,
    calculated: 3
}
const EnipIODataType = {
    bit: 0,
    integer16: 1
}
var globalIOScanner = undefined; //shared by all Ethernet/IP devices
function GenericEthernetIPclient(_data, _logger, _events) {

    var deviceType = 'EthernetIPclient';
    var device = JSON.parse(JSON.stringify(_data)); // Current Device data { id, name, tags, enabled, ... }
    var tagMemoryTable = []; //Buffers indexed by tag id, mirrors memory on device
    var logger = _logger;
    var events = _events;               // Events to commit change to runtime
    var lastStatus = '';                // Last Device status     
    var working = false;                // Working flag to manage overloading polling and connection
    var conn;// = new STEthernetIp.Controller();  // connection for explicit and symbolic messaging
    var globalIOScanner;                      // Connection Manager for IO exchange
    var ioconnections = [];             //  IO connections
    var numberOfIOScannersWaitingToConnect = 0;
    var connectionAttempts = 5;
    var doneReading = false;
    var doneWriting = false;
    var overloading = 0;                // Overloading counter to mange the break connection
    var connected = false;              // Connected flag
    var ioconnected = false;
    var itemsMap = {};                  // Items Mapped Tag name with Item path to find for set value
    var varsValue = [];                 // Signale to send to frontend { id, type, value }
    var lastTimestampValue;             // Last Timestamp of asked values
    /**
     * initialize the device type 
     */
    this.init = function (_type) {
        console.error('Not supported!');
    }

    /**
     * Connect to device
     * Emit connection status to clients, clear all Tags values
     */
    this.connect = function () {
        return new Promise(function (resolve, reject) {
            (async () => {
                try {
                    if (device.property && device.property.address) {
                        console.log('in connect, calling checkWroking');
                        if (_checkWorking(true)) {
                            console.log('in connect checkworking returned true');
                            console.log(`'${device.name}' try to connect ${device.property.address}`);
                            logger.info(`'${device.name}' try to connect ${device.property.address}`, true);
                            await _connect();
                            connected = true;
                            console.log(`'${device.name}' connected!`);
                            logger.info(`'${device.name}' connected!`, true);
                            _emitStatus('connect-ok');
                            _checkWorking(false);
                            return resolve();

                        } else {
                            console.log('in connect checkWorking returned false');
                            _emitStatus('connect-error');
                            return reject();                            
                        }
                    } else {
                        logger.error(`'${device.name}' missing connection data!`);
                        _emitStatus('connect-failed');
                        _clearVarsValue();
                        return reject();
                    }
                } catch (err) {
                    console.log('caught async execption in connect');
                    console.log(err);
                    logger.error(`'${device.name}' try to connect error! ${err}`);
                    _checkWorking(false);
                    _emitStatus('connect-error');
                    _clearVarsValue();
                    return reject();
                }
            })()
        });
    }


    /**
     * Disconnect the device
     * Emit connection status to clients, clear all Tags values
     */
    this.disconnect = function () {
        return new Promise(function (resolve, reject) {
            (async () => {
                try {
                    await _disconnectAll();
                    resolve();
                } catch (error) {
                    logger.error(`'${data.name}' disconnect failure! ${error}`);
                    reject(error)

                }
                connected = false;
                _checkWorking(false);
                _emitStatus('connect-off');
                _clearVarsValue();
            })()
        });
    }

    /**
     * Read values in polling mode 
     * Update the tags values list, save in DAQ if value changed or in interval and emit values to clients
     */
    this.polling = async function () {
        console.log('in polling, calling checkworking');
        if (_checkWorking(true, true)) {
            console.log('polling: checkworking returned true enip device connected ' + conn?.established);
            if (ioconnections?.length > 0) {
                for (const ioconn of ioconnections) {
                    console.log('polling: ioconn connected ' + ioconn.connected);
                }
            }
            if (conn && this.isConnected()) {
                try {
                    const result = await _readValues();
                    console.log('calling checkWorking in after readValues in polling');
                    _checkWorking(false, true);
                    if (result && Object.keys(result).length > 0) {
                        let varsValueChanged = _updateVarsValue(result);
                        lastTimestampValue = new Date().getTime();
                        _emitValues(varsValue);
                        if (this.addDaq && !utils.isEmptyObject(varsValueChanged)) {
                            this.addDaq(varsValueChanged, device.name, device.id);
                        }
                    } else {
                        // console.error('then error');
                    }
                    
                    // _readValues().then(result => {
                    //     console.log('calling checkWorking in after readValues in polling');
                    //     _checkWorking(false, true);
                    //     if (result) {
                    //         let varsValueChanged = _updateVarsValue(result);
                    //         lastTimestampValue = new Date().getTime();
                    //         _emitValues(varsValue);
                    //         if (this.addDaq && !utils.isEmptyObject(varsValueChanged)) {
                    //             this.addDaq(varsValueChanged, device.name, device.id);
                    //         }
                    //     } else {
                    //         // console.error('then error');
                    //     }
                    // }, reason => {
                    //     logger.error(`'${device.name}' _readValues error! ${reason}`);
                    //     _checkWorking(false, true);
                    // });
                } catch (err) {
                    logger.error(`'${device.name}' polling error: ${err}`);
                    _checkWorking(false, true);
                }
            } else {
                console.log('calling checkWorking in polling, not connected');
                _checkWorking(false, true);
            }
        } else {
            console.log('in polling, checkworking returned false');
        }
    }

    /**
     * Load Tags attribute to read with polling
     */
    this.load = function (_data) {
        varsValue = [];
        tagMemoryTable = [];
        device = JSON.parse(JSON.stringify(_data));
        try {
            itemsMap = {};
            var count = Object.keys(device.tags).length;
            for (var id in device.tags) {
                itemsMap[id] = device.tags[id];
            }
            logger.info(`'${device.name}' data loaded (${count})`, true);
        } catch (err) {
            logger.error(`'${device.name}' load error! ${err}`);
        }
    }

    /**
     * Return Tags values array { id: <name>, value: <value> }
     */
    this.getValues = function () {
        return varsValue;
    }

    /**
     * Return Tag value { id: <name>, value: <value>, ts: <lastTimestampValue> }
     */
    this.getValue = function (id) {
        if (varsValue[id]) {
            return { id: id, value: varsValue[id].value, ts: lastTimestampValue };
        }
        return null;
    }

    /**
     * Return connection status 'connect-off', 'connect-ok', 'connect-error', 'connect-busy'
     */
    this.getStatus = function () {
        return lastStatus;
    }

    /**
     * Return Tag property to show in frontend
     */
    this.getTagProperty = function (tagid) {
        if (device.tags[tagid]) {
            return { id: tagid, name: device.tags[tagid].name, type: device.tags[tagid].type, format: device.tags[tagid].format };
        } else {
            return null;
        }
    }

    /**
     * Set the Tag value to device
     * take the address from
     */
    this.setValue = function (tagId, value) {
        if (device.tags[tagId]) {
            let valueToSend = deviceUtils.tagRawCalculator(value, device.tags[tagId]);

            // io tag
            if (device.tags[tagId].enipOptions?.tagType === EnipTagType.assemblyIO) {
                // find connection associated with the tag
                for (const ioconn of ioconnections) {
                    if (device.tags[tagId].enipOptions?.ioOpt?.ioModuleId === ioconn.id &&
                        device.tags[tagId].enipOptions?.ioOpt?.ioOutput === true) { //output tag
                            ioconn.setValue(tagId, value);
                            return true;
                    }
                }
            }

            //is it explicit data
            if (device.tags[tagId].enipOptions?.tagType === EnipTagType.explicit) {
                
                const theTag = device.tags[id];
                let valueBuf = undefined;
                if (theTag.enipOptions.explicitOpt?.class  === undefined ||
                    theTag.enipOptions.explicitOpt?.instance === undefined ||
                    theTag.enipOptions.explicitOpt?.attribute === undefined) {
                    
                    logger.error(`'${device.tags[tagId].name}' Explicit tag definition missing class or instance or attribute`);
                    return false;

                }
                if (theTag.enipOptions?.sendBuffer?.length > 0) {
                    const trimedVal = theTag.enipOptions.sendBuffer.replace(/\s/g, "");
                    try {
                        valueBuf = Buffer.from(trimedVal, 'hex');
                    } catch (error) {
                        logger.error(`'${device.tags[tagId].name}' error converting send buffer from hex ${error}`);
                    }
                }
                
                conn?.setAttributeSingle(theTag.enipOptions.explicitOpt.class,
                            theTag.enipOptions.explicitOpt.instance,
                            theTag.enipOptions.explicitOpt.attribute,
                            valueBuf).then(() => {
                    logger.info(`'${device.tags[tagId].name}' setValue(${tagId}, ${valueToSend})`, true, true);
                }).catch(error => {
                    logger.error(`'${device.tags[tagId].name}' setValue error! ${error}`);
                }); 
                return true;
            }
        }
        return false;
    }

    /**
     * Return if device is connected
     */
    this.isConnected = function () {
        let allioconnected = true;
        for (const ioconn of ioconnections) {
            console.log('isConnected:: ioconn connected ' + ioconn.connected);
            allioconnected &&= ioconn.connected;
        }
        console.log('isConnected:: conn.established ' + conn?.established);
        connected = conn?.established && allioconnected;
        return connected;
    }

    /**
     * Bind the DAQ store function
     */
    this.bindAddDaq = function (fnc) {
        this.addDaq = fnc;                         // Add the DAQ value to db history
    }
    this.addDaq = null;

    /**
     * Return the timestamp of last read tag operation on polling
     * @returns 
     */
     this.lastReadTimestamp = () => {
        return lastTimestampValue;
    }

    /**
     * Return the Daq settings of Tag
     * @returns 
     */
    this.getTagDaqSettings = (tagId) => {
        return device.tags[tagId] ? device.tags[tagId].daq : null;
    }

    /**
     * Set Daq settings of Tag
     * @returns 
     */
    this.setTagDaqSettings = (tagId, settings) => {
        if (device.tags[tagId]) {
            utils.mergeObjectsValues(device.tags[tagId].daq, settings);
        }
    }

    /**
     * Clear local Items value by set all to null
     */
    var _clearVarsValue = function () {
        for (var id in varsValue) {
            varsValue[id].value = null;
        }
        if (varsValue.length) {
            _emitValues(varsValue);
        }
    }

    /**
     * Read all values
     */
    var _readValues = async function () {
        // return new Promise((resolve, reject) => {

        const items = {};

        const tags = Object.values(device.tags);
        // read IO module/table tags
        // these values are already in memory, as the IO data is sent periodically over UDP
        // so no additional communication is needed
        for (const ioconn of ioconnections) {
            const connTags = tags?.filter(tag => (tag.enipOptions?.tagType === EnipTagType.assemblyIO && //io tag
                tag.enipOptions?.ioOpt?.ioModuleId === ioconn.id && //tag associated with this io connection
                tag.enipOptions?.ioOpt?.ioOutput === false)); // input tag
            for (const tag of connTags) {
                items[tag.id] = ioconn.getValue(tag.id);
                console.log(`tag ${tag.name} value: ${items[tag.id]}`);
            }
        }

        //read explicit msg tags.
        for (var id in device.tags) {
            if (device.tags[id].enipOptions?.tagType !== EnipTagType.explicit) {
                continue;
            }
            const theTag = device.tags[id];
            const tagValue = await conn?.getAttributeSingle(theTag.enipOptions.explicitOpt.class, theTag.enipOptions.explicitOpt.instance, theTag.enipOptions.explicitOpt.attribute);
            console.log(tagValue);
            items[id] = tagValue;
            tagMemoryTable[id] = tagValue;//do we need this?
        }
        return items;

        
        // // for symoblic
        // if supports taggroups... else read one at a time
        // const group = new STEthernetIp.TagGroup();
        // var count = Object.keys(data.tags).length;
        // for (var id in data.tags) {
        //     if (data.tags[id].enipOptions?.tagType !== STEthernetIp.EnipTagType.symbolic){
        //         continue;
        //     }
        //     group.add(new STEthernetIp.Tag(data.tags[id].address));
        // }
        // const items = {};
        // conn.readTagGroup(group).then(() => {
        //     group.forEach(tag => {
        //         console.log(tag.value);
        //         items[tag.state.tag.name] = tag.value;
        //     });
        //     resolve(items);
        // }).catch(err){
        //     reject(err);
        // };
        // // end symbolic

        // conn.readAllItems((err, items) => {
        //     if (err) {
        //         reject(err);
        //     }
        //     resolve(items);
        // });
        //});
    }

    /**
     * Update the Tags values read
     * @param {*} vars 
     */
    var _updateVarsValue = (vars) => {
        const timestamp = new Date().getTime();
        var changed = {};
        for (const id in vars) {
            if (!utils.isNullOrUndefined(vars[id])) {
                
                var valueChanged = itemsMap[id].value !== vars[id];
                itemsMap[id].rawValue = vars[id];
                itemsMap[id].value = deviceUtils.tagValueCompose(vars[id], itemsMap[id]);
                varsValue[id] = { id: id, value: itemsMap[id].value, type: itemsMap[id].type, daq: itemsMap[id].daq, changed: valueChanged, timestamp: timestamp };
                if (this.addDaq && deviceUtils.tagDaqToSave(varsValue[id], timestamp)) {
                    changed[id] = varsValue[id];
                }
                varsValue[id].changed = false;
            }
        }        
        return changed;
    }

    var _ioConnectionEstablished = function () {
        numberOfIOScannersWaitingToConnect--;
    }
    var _waitForIOConnections = function () {

        return new Promise((resolve, reject) => {
            console.log(`in waitingForIOConnections, numberOfIOScannersWaitingToConnect: ${numberOfIOScannersWaitingToConnect}, connectionAttempts: ${connectionAttempts}`);

            if (numberOfIOScannersWaitingToConnect > 0) {
                connectionAttempts--;
                if (connectionAttempts < 1) {
                    reject(`unable to connect to IO module, connection attempts reached ${connectionAttempts}.`);
                    return;
                }
                setTimeout(() => { _waitForIOConnections().then(resolve).catch(reject); }, 500);
            } else {
                for (let ioconn of ioconnections) {
                    ioconn.removeListener('connected', _ioConnectionEstablished);
                }
                console.log('io connections finished connecting');
                resolve('IO connections made.');
            }

        });

    }
    // var _waitForIOConnections = function () {
    //     return new Promise(function (resolve, reject) {
      
    //       if (numberOfIOScannersWaitingToConnect > 0) {
    //         setTimeout( () => { _waitForIOConnections().then(resolve); }, 500);
    //       } else {
    //         for (let ioconn of ioconnections) {
    //             ioconn.removeListener('connected', _ioConnectionEstablished);
    //         }
    //         console.log('io connections finished connecting');
    //         resolve('IO connections made.');
    //       }
    //     });

    //   }
      var _closeScanner = function (successCallback, errorCallback) {
        try {
            if (globalIOScanner) {
                globalIOScanner.socket.close(() => {
                    globalIOScanner = undefined;
                    console.log('scanner closed');
                    successCallback(true);
                });
            } else {
                console.log('scanner not open, success');
                successCallback(true);
            }
        } catch (err) {
            errorCallback(false);
        }
    }
    var _closeScannerWrapper = function () {
        return new Promise((resolve, reject) => {
            _closeScanner((successResponse) => {
                resolve(successResponse);
            }, (errorResponse) => {
                reject(errorResponse);
                return;
            });
        });
    }
    var _disconnectAll = async function () {
        console.log('disconnectAll!!!!!!');
        
        for (let ioconn of ioconnections) {
            if (ioconn) {
                ioconn.run = false;
                try {
                    console.log('closing io connection...')
                    await ioconn.tcpController.disconnect();
                    console.log('io connection closed');
                } catch (error) {
                    console.log('Error disconnecting io connection');
                    console.log(error);
                    ioconn.tcpController.destroy();
                    ioconn.tcpController._removeControllerEventHandlers();
                    console.log('forced io connection closed');
                }
                const filteredConn = globalIOScanner.connections.filter(gioconn => {
                    const ret =  gioconn !== ioconn;
                    return ret;
             } );
             console.log(`filtered connections length ${filteredConn.length}`);
                ioconn = undefined;
                globalIOScanner.connections = filteredConn;
            }
            //ioconn.run = false; //stop the internal reconnect tries
        }
        ioconnections = [];
        if (globalIOScanner?.connections?.length === 0) {
            const result = await _closeScannerWrapper();
        }
        
        if (conn !== undefined) {
            try {
                console.log('closing message connection');
                await conn.disconnect();
                console.log('message connectoin closed');
            } catch (error) {
                console.log('Error disconnecting messaege connection');
                console.log(error);
                conn.destroy();
                conn._removeControllerEventHandlers();
                console.log('forced message connection closed');
            }
           conn = undefined;
        }
    }
    var _mapIOTags = function () {
        for (const ioconn of ioconnections) {
            const tags = Object.values(device.tags);
            const connTags = tags?.filter(tag => (tag.enipOptions?.tagType === EnipTagType.assemblyIO && 
                tag.enipOptions?.ioOpt?.ioModuleId === ioconn.id));
            for (const tag of connTags) {
                //register the tag "map" with the ethernetip io connection
                if (tag.enipOptions.ioOpt.ioOutput) {
                    // will be written to output io table
                    if (tag.enipOptions.ioOpt.ioType === EnipIODataType.bit) {
                        ioconn.addOutputBit(tag.enipOptions.ioOpt.ioByteOffset, tag.enipOptions.ioOpt.ioBitOffset, tag.id);
                    } else if (tag.enipOptions.ioOpt.ioType === EnipIODataType.integer16) {
                        ioconn.addOutputInt(tag.enipOptions.ioOpt.ioByteOffset, tag.id);
                    }
                } else {                    
                    // will be read from input io table
                    if (tag.enipOptions.ioOpt.ioType === EnipIODataType.bit) {
                        ioconn.addInputBit(tag.enipOptions.ioOpt.ioByteOffset, tag.enipOptions.ioOpt.ioBitOffset, tag.id);
                    } else if (tag.enipOptions.ioOpt.ioType === EnipIODataType.integer16) {
                        ioconn.addInputInt(tag.enipOptions.ioOpt.ioByteOffset, tag.id);
                    }
                }
            }
        }
    }
    var _makeIOConnection = async function (addr, ioport) {
        console.log('Make IO Connections');
        ioconnections = [];
        numberOfIOScannersWaitingToConnect = 0;
        connectionAttempts = 5;
        if (device.modules !== undefined) {
            const modules = Object.values(device.modules);
            if (modules.length > 0) {
                numberOfIOScannersWaitingToConnect = modules.length;
                // if (globalIOScanner !== undefined) {
                //     //ioscanner.socket.close();
                //     await globalIOScanner.socket[Symbol.asyncDispose]();
                //     globalIOScanner = undefined;
                // }
                if (globalIOScanner === undefined) {
                    globalIOScanner = new STEthernetIp.IO.Scanner();
                    await globalIOScanner.bind(2222, '0.0.0.0');
                }
                let totalTimeout = 0;
                for (const module of modules) {
                    const config = {
                        configInstance: {
                            assembly: module.configurationInstance,
                            size: module.configurationSize
                        },
                        outputInstance: {
                            assembly: module.outputInstance,
                            size: module.outputSize
                        },
                        inputInstance: {
                            assembly: module.inputInstance,
                            size: module.inputSize
                        }
                    }
                    // Add a connection with (device config, rpi, ip_address)
                    const ioconn = globalIOScanner.addConnection(config, module.rpi, addr, ioport, false);
                    ioconn.id = module.id;
                    totalTimeout += ioconn.tcpController.timeout_sp;
                    let self = this;
                    ioconn.on('connected', _ioConnectionEstablished);
                    ioconnections.push(ioconn);                   
                    // Above does forwardOpen async, returns before connection is open
                    // connection is not marked open until first UDP packet (acutal data) is received
                }
                _mapIOTags();
                connectionAttempts = Math.trunc(totalTimeout/500);
                return _waitForIOConnections(totalTimeout);
            }
        }
        return true;
    }
    /**
     * Connect to the ethernet/IP device.  Several connections at once are possible.
     * 0-n IO Connections, one per IO table.  The ethernet/IP IO client binds to UDP
     * port 2222 (default) to recieve IO data.  For each IO connection/table a separate
     * TCP connection is made by the ethernet/IP client to setup/manage the IO data that
     * is exchanged.
     * 
     * If explicit messages (getAttributeSingle/sendAttributeSingle) or proprietary 
     * Rockwell symbolic messages are exchanged, an additional TCP connection is made.
     */
    var _connect = async function () {

        await _disconnectAll();
        var port = 44818;
        var addr = device.property.address;
        var ioport = device.property.ioport;
        if (device.property.address.indexOf(':') !== -1) {
            var addr = device.property.address.substring(0, device.property.address.indexOf(':'));
            var temp = device.property.address.substring(device.property.address.indexOf(':') + 1);
            port = parseInt(temp);
        }

        conn = new STEthernetIp.Controller();
        if (device.property.options) {
            await conn.connect(addr, device.property.slot, false);
        } else {
            await conn.connect(addr, 0, false);
            console.log('conn is now connected!!!!');
        }
        await _makeIOConnection(addr, device.property.ioport).catch(error => {
            console.log('_makeIOConnections failed');
            console.log(error);
            throw (error);
        });
    }

    /**
     * Emit the PLC connection status
     * @param {*} status 
     */
    var _emitStatus = function (status) {
        lastStatus = status;
        events.emit('device-status:changed', { id: device.id, status: status });
    }
    
    /**
     * Emit the webapi Tags values array { id: <name>, value: <value>, type: <type> }
     * @param {*} values 
     */
    var _emitValues = function (values) {
        events.emit('device-value:changed', { id: device.id, values: values });
    }

    /**
     * Used to manage the async connection and polling automation (that not overloading)
     * @param {*} check 
     */
    var _checkWorking = function (check, isPolling=false) {
        if (check && working) {
            overloading++;
            logger.warn(`'${device.name}' working (connection || polling=${isPolling}) overload! ${overloading}`);
            // !The driver don't give the break connection
            return false;
            // if (overloading >= 3) {
            // this causes too many problems with the connections maintained by the ethernetip api
            // as the sockets that it may be waiting on, will be closed here
            // better to let them timeout and reconnect in the connect method
            //     await _disconnectAll(); 
            // } else {
            //     return false;
            // }
        }
        working = check;
        overloading = 0;
        return true;
    }
}

module.exports = {
    init: function (settings) {
    },
    create: function (data, logger, events, manager) {
        // To use with plugin
        process.on('warning', e => console.warn(e.stack));
        try { STEthernetIp = require('st-ethernet-ip'); } catch { }
        if (!STEthernetIp && manager) { try { STEthernetIp = manager.require('st-ethernet-ip'); } catch { } }
        if (!STEthernetIp) return null;
        return new GenericEthernetIPclient(data, logger, events);
    }
}
