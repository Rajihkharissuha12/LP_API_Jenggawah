const response = async (
  response,
  status_code,
  type,
  suggestion,
  data,
  message,
  req,
  res
) => {
  const responseData = {
    success: response,
    status_code: status_code,
    message: message,
    data: data,
    meta: {
      timestamp: new Date().toISOString(),
      request_id: req.id || req.headers["x-request-id"],
      type: type,
      suggestion: suggestion,
    },
  };
  return res.status(status_code).json(responseData);
};
module.exports = { response };
