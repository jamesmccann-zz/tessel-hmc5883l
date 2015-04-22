var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Queue = require('sync-queue');

var I2C_ADDR = 0x1E,
    CONFIG_A = 0x00,
    CONFIG_B = 0x01,
    MODE = 0x02,
    XOUT_MSB = 0x03,
    XOUT_LSB = 0x04,
    YOUT_MSB = 0x05;

// Samples per measurement
var CRA_SAMPLES_8 = 0x03, // 0b11
    CRA_SAMPLES_4 = 0x02, // 0b10
    CRA_SAMPLES_2 = 0x01, // 0b01
    CRA_SAMPLES_1 = 0x00; // 0b00

// Data output rate
var CRA_DATARATE_75   = 0x06, // 0b110
    CRA_DATARATE_30   = 0x05, // 0b101
    CRA_DATARATE_15   = 0x04, // 0b100
    CRA_DATARATE_7_5  = 0x03, // 0b011
    CRA_DATARATE_3    = 0x02, // 0b010
    CRA_DATARATE_1_5  = 0x01, // 0b001
    CRA_DATARATE_0_75 = 0x00; // 0b000

// Measurement mode
var CRA_MEASUREMENT_MODE_NEGATIVE = 0x02, // 0b10
    CRA_MEASUREMENT_MODE_POSITIVE = 0x01, // 0b01
    CRA_MEASUREMENT_MODE_NORMAL   = 0x00; // 0b00

// Mode register
var MR_HIGH_SPEED      = 0x80, // 0b10000000
    MR_MODE_IDLE       = 0x03, // 0b11
    MR_MODE_SINGLE     = 0x01, // 0b01
    MR_MODE_CONTINUOUS = 0x00; // 0b00

var Hmc5883l = function(port) {
  this.i2c = new port.I2C(I2C_ADDR);
  this.queue = new Queue();

  this.init();
};

util.inherits(Hmc5883l, EventEmitter);

Hmc5883l.prototype.init = function() {
  var self = this;
  // Set data output rate to 75Hz
  this._writeRegister(0x00, 0x14);

  // Set mode to continuous
  this._writeRegister(0x02, 0x00, function() {
    self.emit('ready');
  });
};

Hmc5883l.prototype._readRegisters = function (addressToRead, bytesToRead, callback) {
  var self = this;

  this.queue.place(function() {
    self.i2c.transfer(new Buffer([addressToRead]), bytesToRead, function() {
      self.queue.next();
      if (callback) { callback.apply(self, arguments); }
    });
  });
};

Hmc5883l.prototype._writeRegister = function (addressToWrite, dataToWrite, callback) {
  var self = this;

  this.queue.place(function() {
    self.i2c.send(new Buffer([addressToWrite, dataToWrite]), function() {
      self.queue.next();
      if (callback) { callback.apply(self, arguments); }
    });
  });
};

Hmc5883l.prototype.readRawData = function (callback) {
  this._readRegisters(0x03, 6, function(err, rx) {
    var hx = rx.readInt16BE(0);
    var hy = rx.readInt16BE(2);
    var hz = rx.readInt16BE(4);

    if (callback) {
      callback(hx, hy, hz);
    }
  });
};

Hmc5883l.prototype.getBearing = function(hx, hy, hz) {
  if (hy > 0) {
    return 90 - Math.atan2(hx, hy) * 57.295;
  } else if (hy < 0) {
    return 270 - Math.atan2(hx, hy) * 57.295;
  } else if (hx < 0) {
    return 180;
  } else {
    return 0;
  }
};

Hmc5883l.prototype.readBearing = function(callback) {
  var self = this;
  self.readRawData(function(hx, hy, hz) {
    var bearing = self.getBearing(hx, hy, hz);
    if (callback) {
      callback(bearing);
    }
  });
};

var use = function(port) {
  return new Hmc5883l(port);
};

exports.use = use;



