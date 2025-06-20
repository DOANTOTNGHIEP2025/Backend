const User = require("../models/User");
const Doctor = require("../models/Doctor");
const Region = require("../models/Region");
const Speciality = require("../models/Speciality");
const Appointment = require("../models/Appointment");
const cloudinary = require("../utils/cloudinary");

const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const ejs = require("ejs");
const crypto = require("crypto");
const Admin_Access = require("../models/Admin_Access");

require("dotenv").config();


class account_Controller {
    create_Token = (_id, expiresIn = "1d") => {
        return jwt.sign({ _id }, process.env.JWTSecret, { expiresIn });
    };

    acc_Login = async (req, res) => {
       
        const { email, password } = req.body;
        console.log(req.headers["content-type"]);
      
        try {
            let acc;
            acc = await User.login(email, password);

            if (acc.is_deleted) {
                return res.status(403).json({
                error:
                    "Tài khoản của bạn đã bị vô hiệu hóa. Vui lòng liên hệ quản trị viên để được hỗ trợ.",
                });
            }

            const token = this.create_Token(acc._id);

            const adminAccess = await Admin_Access.findOne({ user_id: acc._id })
            if (adminAccess instanceof Admin_Access) {
                return res.status(200).json({ email, token, adminAccess })
            }
            
            if (acc instanceof Doctor) {
                const verified = acc.verified;
                res.status(200).json({ email, token, verified });
            } else {
                res.status(200).json({ email, token });
            }
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    acc_Signup = async (req, res) => {
        try {
            if (req.fileValidationError) {
                return res.status(400).json({ error: req.fileValidationError });
            }
           
            const { email, password, username, phone, is_doc } = req.body;

            let acc;

            // add account
            if (is_doc == "1") {
                let proof = null;
                    if (req.file) {
                    
                    const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                        folder: "PBL6/proofs",
                        overwrite: true,
                    });

                    // Extract proof URL and delete temporary file
                    proof = uploadResult.secure_url;

                    try {
                        await fs.promises.unlink(req.file.path);
                    } catch (err) {
                        console.error("Failed to delete temp file: ", err.message);
                    }
                }

                acc = await Doctor.add_Doctor(email, password, username, phone, proof);
            } else {
                
                acc = await User.add_User(email, password, username, phone);
            }
            // create token and respone
            const token = this.create_Token(acc._id, "1d");

            const confirm_Url = `${req.protocol}://${req.get(
                "host"
            )}/acc/confirm-acc/${token}`;

            await this.send_Confirmation_Email(email, username, confirm_Url);

            res.status(201).json({ email, token });
        } catch (error) {
            //if user account
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    get_Account_List = async (req, res) => {
        try {
            let accounts, query;
            const { user, hidden_state, verified } = req.body;

            query = { is_deleted: hidden_state };

            if (user === true) {
                // Handle users
                query.__t = { $ne: "Doctor" };

                accounts = await User.find(query);
            } else {
                // Handle doctors
                query = { is_deleted: hidden_state };

                if (verified !== undefined) {
                query.verified = verified;
                }

                accounts = await Doctor.find(query)
                .populate("speciality_id", "name")
                .populate("region_id", "name");
            }

            res.status(200).json(accounts);
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    get_Account_By_Mail = async (req, res) => {
        try {
            // get id
            const { email } = req.body;

            let account = await User.findOne({ email })
                .populate("speciality_id", "name")
                .populate("region_id", "name");

            res.status(200).json(account);
        } catch (error) {
        console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    get_Account_By_Id = async (req, res) => {
        try {
            // get id
            const account_Id = req.params.id;

            let account = await User.findById(account_Id)
                .populate("speciality_id", "name")
                .populate("region_id", "name");

            res.status(200).json(account);
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    update_Acc_Info = async (req, res) => {
        try {
         
            const { username, phone, underlying_condition, date_of_birth, address } = req.body;

         
            const account_Id = req.params.id;

            // find account
            let account = await User.findById(account_Id);

            if (!account) {
                return res.status(404).json({ error: "Account not found" });
            }

            if (req.fileValidationError) {
                return res.status(400).json({ error: req.fileValidationError });
            }

            let profile_image = account.profile_image;

            if (req.file) {
                const image_name = `${account_Id}_${Date.now()}`;

                const uploadResult = await cloudinary.uploader.upload(req.file.path, {
                    folder: "PBL6/profiles",
                    public_id: account_Id,
                    overwrite: true, // Replace any existing file with the same name
                });

                profile_image = uploadResult.secure_url;
                fs.unlinkSync(req.file.path);
            }

            // update
            if (username) {
                account.username = username;
            }
            if (phone) {
                account.phone = phone;
            }
            if (underlying_condition) {
                account.underlying_condition = underlying_condition;
            }
            if (date_of_birth) {
                account.date_of_birth = date_of_birth;
            }
            if (address) {
                account.address = address;
            }
            account.profile_image = profile_image;

            await account.save();

            res.status(200).json(account);
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    soft_Delete_Account = async (req, res) => {
        try {
            const session = await mongoose.startSession()

          
            session.startTransaction()

            const { account_Ids } = req.body;

        
            if (
                !account_Ids ||
                !Array.isArray(account_Ids) ||
                account_Ids.length === 0
            ) {
                return res.status(400).json({ error: "No IDs provided" });
            }

            // update
            const result = await User.updateMany(
                { _id: { $in: account_Ids } },
                { is_deleted: true },
                {session}
            );

           
            const cancel_appointment = await Appointment.deleteMany(
                {user_id: {$in: account_Ids}},
                {session}
            )

            // Commit the transaction
            await session.commitTransaction()
            session.endSession()

            res.status(200).json({
                message: 'Account soft deleted',
                modifiedCount: result.modifiedCount,
                canceledAppointments: cancel_appointment.deletedCount
            })
        } catch (error) {
            
            await session.abortTransaction()
            session.endSession()

            console.log(error.message)
            res.status(400).json({error: error.message})
        }
    };

    restore_Deleted_Account = async (req, res) => {
        try {
            // get id list
            const { account_Ids } = req.body;

            // if no ids
            if (
                !account_Ids ||
                !Array.isArray(account_Ids) ||
                account_Ids.length === 0
            ) {
                return res.status(400).json({ error: "No IDs provided" });
            }

            // update
            const result = await User.updateMany(
                { _id: { $in: account_Ids } },
                { is_deleted: false }
            );

            res.status(200).json({
                message: "Account restored",
                modifiedCount: result.modifiedCount,
            });
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    perma_Delete_Account = async (req, res) => {
        try {
            const session = await mongoose.startSession()

            // Start transaction
            session.startTransaction()

           
            const { account_Ids } = req.body;

            if (
                !account_Ids ||
                !Array.isArray(account_Ids) ||
                account_Ids.length === 0
            ) {
                return res.status(400).json({ error: "No IDs provided" });
            }

            // Find doctor_ids in Appointment collection
            const doctors_in_appointments = await Appointment.distinct('doctor_id')

            
            const filtered_Ids = account_Ids.filter(
                id => !doctors_in_appointments.includes(id)
            )

            // If no valid account IDs remain
            if (filtered_Ids.length === 0) {
                return res.status(400).json({ error: 'No valid accounts to delete' })
            }

            // Find the accounts to delete and retrieve their profile image public_ids
            const accounts = await User.find({ _id: { $in: filtered_Ids } }, 'profile_image proof')

            const public_Ids = accounts.flatMap((account) =>
                [
                account.profile_image
                    ? account.profile_image.split("/").slice(-3).join("/")
                    : null,
                account.proof ? account.proof.split("/").slice(-3).join("/") : null,
                ].filter(Boolean)
            );

            // Delete images from Cloudinary
            if (public_Ids.length > 0) {
                const cloudinary_Delete_Promises = public_Ids.map((public_Id) => {
                    return new Promise((resolve) => {
                        cloudinary.uploader.destroy(public_Id, (error, result) => {
                            if (error) {
                                console.error(`Failed to delete ${public_Id}:`, error.message);
                                return resolve(null);
                            }
                            resolve(result);
                        });
                    });
                });
                // 
                await Promise.all(cloudinary_Delete_Promises); 
            }

           
            const result = await User.deleteMany(
                {_id: {$in: filtered_Ids}},
                {session}
            )

            // cancel all appointment with the same user_id
            const cancel_appointment = await Appointment.deleteMany(
                {user_id: {$in: filtered_Ids}},
                {session}
            )

            // Commit the transaction
            await session.commitTransaction()
            session.endSession()

            res.status(200).json({
                message: 'Account deleted',
                modifiedCount: result.modifiedCount,
                canceledAppointments: cancel_appointment.deletedCount
            })
        } catch (error) {
        
            await session.abortTransaction()
            session.endSession()

            console.log(error.message)
            res.status(400).json({error: error.message})
        }
    };

    forgot_password = async (req, res) => {
        try {
            const { email } = req.body;
            const account = await User.findOne({ email });

            if (!account) {
                return res.status(404).json({ error: "Account not found" });
            }

            // Generate a reset token
            const reset_Token = this.create_Token(account._id, "10m");

            const transporter = nodemailer.createTransport({
                service: process.env.EMAIL_HOST,
                auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
                },
            });

            const reset_URL = `${req.protocol}://${req.get(
                "host"
            )}/acc/reset-password/${reset_Token}`;

            // Render email content
            const html_Content = await ejs.renderFile(
                path.join(__dirname, "../views", "password-reset.ejs"),
                {
                username: account.username, 
                reset_URL, 
                }
            );

            const mail_Options = {
                from: process.env.EMAIL,
                to: email,
                subject: "Đặt lại mật khẩu",
                html: html_Content,
            };

            await transporter.sendMail(mail_Options);

            res.status(200).json({ 
                message: "Password reset link sent to your email" 
            });
        } catch (error) {
            console.log(error.message);
            res.status(500).json({ error: error.message });
        }
    };

    reset_password = async (req, res) => {
        try {
            const token = req.params.token;

            if (!token) {
                throw new Error("Token is required");
            }

            // Verify the token
            const decoded = jwt.verify(token, process.env.JWTSecret);
            const user = await User.findById(decoded._id);

            if (!user) {
                throw new Error("No user found");
            }

            // Generate new password
            const new_Password = crypto.randomBytes(4).toString("hex").slice(0, 8);

            // Set new password
            const updated_user = await User.change_pass(
                user.email,
                new_Password,
                true
            );

            // Render the return page with the new password
            const html_Content = await ejs.renderFile(
                path.join(__dirname, "../views", "password-reset-success.ejs"), {
                    new_Password, 
            });

            return res.status(200).send(html_Content);
        } catch (error) {
            const error_Message =
                error.name === "TokenExpiredError"
                ? "Đường dẫn xác nhận đã hết hạn. Xin hãy thử lại đường dẫn mới sau."
                : "Đã xảy ra sự cố. Xin thử lại sau.";

            // Render the error page with the error message
            const html_Error_Content = await ejs.renderFile(
                path.join(__dirname, "../views", "landing-error.ejs"),{
                error_Message, 
            });

           
            return res.status(400).send(html_Error_Content);
        }
    };

    change_password = async (req, res) => {
        try {
            
            const { email, new_password } = req.body;
            const user = await User.change_pass(email, new_password);

            console.log(user);
            res.status(200).json({ email, user });
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    getProfileAdmin = async (req, res) => {
        try {
            const {email} = req.user;
            const adminData = await User.findOne({ email });

            if (!adminData) {
                return res.status(404).json({ error: "Admin profile not found" });
            }

            res.json({ success: true, adminData });
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };

    getTopUsers = async (req, res) => {
        try {
            const result = await Appointment.aggregate([
                {
                $match: {
                    is_deleted: { $ne: true },
                },
                },
                {
                $group: {
                    _id: "$user_id",
                    appointmentCount: { $sum: 1 },
                },
                },
                {
                $sort: { appointmentCount: -1 },
                },
                {
                $limit: 5,
                },
                {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "userDetails",
                },
                },
                {
                $project: {
                    userId: "$_id",
                    appointmentCount: 1,
                    userDetails: { $arrayElemAt: ["$userDetails", 0] },
                },
                },
            ]);

            if (!result.length) {
                return res.status(404).json({ message: "No users found." });
            }

            return res.status(200).json({ data: result });
        } catch (err) {
            console.error("Error:", err);
            return res.status(500).json({
                error: "An error occurred.",
            });
        }
    };

    send_Confirmation_Email = async (email, username, confirm_Url) => {
        // Configure email transporter
        const transporter = nodemailer.createTransport({
        service: process.env.EMAIL_HOST,
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
        });

        const email_Template_Path = path.join(
            __dirname,
            "../views",
            "account-confirmation.ejs"
        );

        // Render email content
        const html_Content = await ejs.renderFile(email_Template_Path, {
            username,
            confirm_Url,
        });

        const mail_Options = {
            from: process.env.EMAIL,
            to: email,
            subject: "Xác minh tài khoản",
            html: html_Content,
        };

        await transporter.sendMail(mail_Options);
    };

    confirm_Account = async (req, res) => {
        try {
            const token = req.params.token;

            if (!token) {
                throw new Error("Token is required");
            }

            // Verify the token
            const decoded = jwt.verify(token, process.env.JWTSecret);

            // Update user's status
            const user = await User.findByIdAndUpdate(
                decoded._id,
                { is_deleted: false },
                { new: true }
            );

            if (!user) {
                throw new Error("No user found");
            }

            return res.status(200).send(
                "<h1>Đã xác minh tài khoản thành công</h1>"
            );
        } catch (error) {
            const error_Message =
                error.name === "TokenExpiredError"
                ? "Đường dẫn xác nhận đã hết hạn. Xin hãy thử lại đường dẫn mới sau."
                : "Đã xảy ra sự cố. Xin thử lại sau.";

            // Render the error page with the error message
            const html_Error_Content = await ejs.renderFile(
                path.join(__dirname, "../views", "landing-error.ejs"),{
                error_Message, 
            });

            return res.status(400).send(html_Error_Content);
        }
    };

    userProfile = async (req, res) => {
        try {
            const user = req.user
        
            res.json({ success: true, user })
        } catch (error) {
            console.error(error)
            res.status(500).json({ success: false, message: "Server error" })
        }
    }

    get_Account_Status = async (req, res) => {
        try {
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ message: "Email is required" });
            }
    
            const user = await User.findOne({ email });
    
            if (!user) {
                return res.status(404).json({ message: "No user found" });
            }
    
            return res.status(200).json({ is_deleted: user.is_deleted });
        } catch (error) {
            console.log(error.message);
            res.status(400).json({ error: error.message });
        }
    };
}

module.exports = new account_Controller();
