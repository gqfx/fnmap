/**
 * Sample JavaScript file for testing
 * This file contains basic functions and classes
 */

const fs = require('fs');
const path = require('path');

// A simple constant
const MAX_SIZE = 100;

/**
 * Add two numbers
 * @param {number} a - First number
 * @param {number} b - Second number
 * @returns {number} Sum of a and b
 */
function add(a, b) {
  return a + b;
}

/**
 * Multiply two numbers
 */
function multiply(a, b) {
  return a * b;
}

/**
 * Calculate the result using add and multiply
 */
function calculate(x, y, z) {
  const sum = add(x, y);
  const result = multiply(sum, z);
  return result;
}

module.exports = { add, multiply, calculate, MAX_SIZE };
