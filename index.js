var util = require('util');
var EventEmitter = require('events').EventEmitter;
var Queue = require('sync-queue');

var I2C_ADDR = 0x1E,
    CONFIG_A = 0x00,
    CONFIG_B = 0x01,
    MODE     = 0x02,
    XOUT_MSB = 0x03,
    ZOUT_MSB = 0x05,
    YOUT_MSB = 0x07,
    STATUS   = 0x08;

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
  this.declination = 0;

  this.init();
};

util.inherits(Hmc5883l, EventEmitter);

Hmc5883l.prototype.init = function() {
  var self = this;
  // Set data output rate to 75Hz
  this._writeRegister(CONFIG_A, 0x14);

  // Set mode to continuous
  this._writeRegister(MODE, 0x00, function() {
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

Hmc5883l.prototype.readStatus = function(callback) {
  this._readRegisters(STATUS, 1, function(err, rx) {
    var status = rx.readInt8(0);

    if (callback) {
      callback({
        lock: status & 0x02,
        ready: status & 0x01
      });
    }
  });
};

Hmc5883l.prototype.readRawData = function (callback) {
  this._readRegisters(XOUT_MSB, 6, function(err, rx) {
    var hx = rx.readInt16BE(0);
    var hz = rx.readInt16BE(2);
    var hy = rx.readInt16BE(4);

    console.log('read hx', hx, 'hy', hy, 'hz', hz);

    if (callback) {
      callback(hx, hy, hz);
    }
  });
};

// Converts the x and y vector components from the mag reading into a bearing
// See http://www.adafruit.com/datasheets/AN203_Compass_Heading_Using_Magnetometers.pdf
Hmc5883l.prototype.getMagneticBearing = function(hx, hy, hz) {
  if (hy > 0) {
    return 90 - Math.atan(hx / hy) * 57.295;
  } else if (hy < 0) {
    return 270 - Math.atan(hx / hy) * 57.295;
  } else if (hx < 0) {
    return 180;
  } else {
    return 0;
  }
};

Hmc5883l.prototype.readTrueBearing = function(callback) {
  var self = this;
  self.readRawData(function(hx, hy, hz) {
    console.log('declnetion', self.declination);
    var bearing = self.getMagneticBearing(hx, hy, hz) + self.declination;
    if (bearing > 360) { bearing -= 360; }

    if (callback) {
      callback(bearing);
    }
  });
};

Hmc5883l.prototype.setDeclination = function(declination) {
  this.declination = declination;
};

var use = function(port) {
  return new Hmc5883l(port);
};

exports.use = use;



