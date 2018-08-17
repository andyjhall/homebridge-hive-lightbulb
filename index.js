var request = require("request");
var Service, Characteristic;

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-hive-lightbulb", "HiveLightBulb", HiveLightBulb);
};

function HiveLightBulb(log, config) {
    this.log = log;
    this.sessionId = null;
    this.baseHive = "https://api-prod.bgchprod.info:443/omnia";
    this.name = config.name;
    this.displayName = config.displayName;
    this.username = config.username;
    this.password = config.password;
    this.debug = Boolean(config.debug) || false;
    this.lightbulb = null;
    this.loginToHive(null);
}

HiveLightBulb.prototype = {

    /**
     * Login to Hive
     * -- Login to the Hive service
     */
    loginToHive: function(callback) {
        var me = this;
        request.post({
            url: this.baseHive + '/auth/sessions',
            headers: {
                'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
                'Accept': 'application/vnd.alertme.zoo-6.1+json',
                'X-Omnia-Client': 'Hive Web Dashboard'
            },
            body: JSON.stringify({
                "sessions": [{
                    "username": this.username,
                    "password": this.password,
                    "caller": "WEB"
                }]
            })
        },
        function(error, response, body) {
            var resp = JSON.parse(body);
            if(resp.errors){
                me.log('You could not login to your hive account.');
            } else {
                me.sessionId = resp.sessions[0].sessionId;
                me.getLightbulb(callback);
            }
        }.bind(this));
    },

    /**
     * Get Light bulb
     * -- Get light bulb
     */
    getLightbulb: function(callback) {
        var me = this;
        request.get({
            url: this.baseHive + '/nodes',
            headers: {
                'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
                'Accept': 'application/vnd.alertme.zoo-6.1+json',
                'X-Omnia-Client': 'Hive Web Dashboard',
                'X-Omnia-Access-Token': this.sessionId,
            },
        },
        function(error, response, body) {
            var resp = JSON.parse(body);
            var id = null;
            if(resp.errors){
                me.log('You could not login to your hive account.');
            } else {
                resp.nodes.forEach(function(node){
                    if (me.name === node.name){
                        id = node.id;
                    }
                });

                // check to see if an id was found
                if(!id) {
                    me.log("Please ensure the device has been setup correctly.")
                }

                // assign id to globel proto
                me.lightbulb = id;

                // return callback
                return callback;
            }
        }.bind(this));
    },

    /**
     * Base Request
     * -- Used for interacting with the bulb
     */
    baseRequest: function(type, body, callback) {
        var me = this;
        if (me.debug) {
            me.log(type, body, callback);
        }
        if(!this.lightbulb) {
            me.log("Please ensure your device is connected to the internet.")
        }
        request[type]({
            url: this.baseHive + '/nodes/' + this.lightbulb,
            headers: {
                'Content-Type': 'application/vnd.alertme.zoo-6.1+json',
                'Accept': 'application/vnd.alertme.zoo-6.1+json',
                'X-Omnia-Client': 'Hive Web Dashboard',
                'X-Omnia-Access-Token': this.sessionId,
            },
            body: JSON.stringify(body),
        },
        function(error, response, body) {
            var responseJSON = JSON.parse(body);
            if ( responseJSON.errors ) {
                return me.loginToHive(function() {
                    if (me.debug) {
                        me.log("Session has expired, retrieving new session id");
                    }
                    me.baseRequest(type, body, callback);
                });
            }
            return callback(responseJSON);
        }.bind(this));
    },

    /**
     *  Get Light Bulb Status
     *  -- Checks to see if lightbulb is on or off.
     */
    getLightbulbOnCharacteristic: function(next) {
        var me = this;
        if (me.debug) {
            me.log("[START] - Checking lightbulb");
        }
        this.baseRequest('get', null, function(response) {
            var me = this;
            if (me.debug) {
                me.log("[COMPLETED] - Checking lightbulb status has completed");
            }
            return next(null, response.nodes[0].attributes.state.reportedValue === 'ON' ? true : false);
        });
    },


    /**
     * Set Lightbulb Status
     * -- Sets the lightbulb to on or off
     */
    setLightbulbOnCharacteristic: function(on, next) {
        var me = this;
        if (me.debug) {
            me.log("[START] - Setting lightbulb");
        }
        this.baseRequest('put', {
            nodes:[
                {
                attributes: {
                        state: {
                            targetValue: on === true ? 'ON' : 'OFF'
                        }
                    }
                }
            ]
        }, function(response) {
            if (me.debug) {
                me.log("[COMPLETED] - Setting lightbulb");
            }
            return next();
        });
    },

    /**
     *  Get Lightbulb Brightness
     *  -- Checks lightbulb brightness level
     */
    getLightbulbBrightnessCharacteristic: function(next) {
        var me = this;
        if (me.debug) {
            me.log("[START] - Checking lightbulb brightness");
        }
        this.baseRequest('get', null, function(response) {
            if (me.debug) {
                me.log("[COMPLETED] - Checking lightbulb brightness");
            }
            return next(null, response.nodes[0].attributes.brightness.reportedValue);
        });
    },

    /**
     *  Set Lightbulb Brightness
     *  -- Sets lightbulb brightness level
     */
    setLightbulbBrightnessCharacteristic: function(brightness, next) {
        var me = this;
        if (me.debug) {
            me.log("[START] - Setting lightbulb brightnesss");
        }
        this.baseRequest('put', {
            nodes:[
                {
                attributes: {
                        brightness: {
                            targetValue: brightness
                        }
                    }
                }
            ]
        }, function(response) {
            var me = this;
            if (me.debug) {
                me.log("[COMPLETED] - Setting lightbulb brightnesss");
            }
            return next();
        });
    },

    /**
     * Sets Service Information
     */
    getServices: function () {
        var informationService = new Service.AccessoryInformation();
        var lightBulbService = new Service.Lightbulb(this.displayName);

        // info
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "British Gas")
            .setCharacteristic(Characteristic.Model, "Hive LightBulb")
            .setCharacteristic(Characteristic.SerialNumber, "N/A");

        // on
        lightBulbService
            .getCharacteristic(Characteristic.On)
            .on('get', this.getLightbulbOnCharacteristic.bind(this))
            .on('set', this.setLightbulbOnCharacteristic.bind(this));

        // brightness
        lightBulbService
            .getCharacteristic(Characteristic.Brightness)
            .on('get', this.getLightbulbBrightnessCharacteristic.bind(this))
            .on('set', this.setLightbulbBrightnessCharacteristic.bind(this));

        this.informationService = informationService;
        this.lightBulbService = lightBulbService;

        return [informationService, lightBulbService];
    }
};
