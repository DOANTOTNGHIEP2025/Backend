const bcrypt = require("bcryptjs");

const password = "doctor123"; // Đổi thành mật khẩu bạn muốn dùng

bcrypt.hash(password, 10).then((hash) => {
  console.log("👉 Mật khẩu đã mã hoá:", hash);
});
