const getJakartaTime = () => {
  return new Date().toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
  });
};

module.exports = { getJakartaTime };
