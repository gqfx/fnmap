/**
 * Sample class file for testing
 */

const EventEmitter = require('events');

/**
 * A sample class that extends EventEmitter
 */
class MyClass extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
    this.count = 0;
  }

  /**
   * Increment the counter
   */
  increment() {
    this.count++;
    this.emit('incremented', this.count);
  }

  /**
   * Get current count
   */
  getCount() {
    return this.count;
  }

  /**
   * Static method to create instance
   */
  static create(name) {
    return new MyClass(name);
  }
}

module.exports = MyClass;
