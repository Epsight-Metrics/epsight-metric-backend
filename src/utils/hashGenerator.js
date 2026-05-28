const crypto = require('crypto');

/**
 * Recursively sort object keys for deterministic JSON stringification
 * @param {*} obj - Object to sort
 * @returns {*} Sorted object
 */
function sortObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  
  return Object.keys(obj)
    .sort()
    .reduce((result, key) => {
      result[key] = sortObject(obj[key]);
      return result;
    }, {});
}

/**
 * Generate SHA256 hash for inspection data integrity
 * @param {Object} inspection - Inspection object
 * @returns {string} SHA256 hash (64 characters hex)
 */
function generateInspectionHash(inspection) {
  // Select all critical fields that should be immutable
  const dataToHash = {
    partId: inspection.partId,
    operatorId: inspection.operatorId,
    sessionId: inspection.sessionId,
    batchId: inspection.batchId,
    idPart: inspection.idPart,
    shape: inspection.shape,
    status: inspection.status,
    matchedRef: inspection.matchedRef,
    nilaiDimensi: inspection.nilaiDimensi,
    timestamp: new Date(inspection.timestamp).toISOString() // Always ISO 8601
  };
  
  // Sort object keys recursively for deterministic output
  const sorted = sortObject(dataToHash);
  
  // Convert to JSON string
  const jsonString = JSON.stringify(sorted);
  
  // Generate SHA256 hash
  return crypto
    .createHash('sha256')
    .update(jsonString)
    .digest('hex');
}

/**
 * Validate inspection data integrity
 * @param {Object} inspection - Inspection object with hash
 * @returns {Object} Validation result
 */
function validateInspectionIntegrity(inspection) {
  if (!inspection) {
    return {
      valid: false,
      message: 'Inspection not found'
    };
  }
  
  if (!inspection.hash) {
    return {
      valid: false,
      message: 'No hash found (legacy data)',
      inspectionId: inspection.id
    };
  }
  
  const calculatedHash = generateInspectionHash(inspection);
  const valid = inspection.hash === calculatedHash;
  
  return {
    valid,
    message: valid 
      ? 'Data integrity verified ✓' 
      : 'WARNING: Data has been tampered! ⚠️',
    savedHash: inspection.hash,
    calculatedHash,
    inspectionId: inspection.id,
    timestamp: inspection.timestamp
  };
}

module.exports = {
  generateInspectionHash,
  validateInspectionIntegrity,
  sortObject
};
