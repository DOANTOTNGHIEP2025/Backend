const Appointment = require("../models/Appointment");
const Doctor = require("../models/Doctor");
const User = require("../models/User");

const ical = require("ical-generator").default;
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
const path = require("path");
const ejs = require("ejs");

class appointment_Controller {
    send_Appointment_Notice_Mail = async (
        appointment_day,
        appointment_time_start,
        appointment_time_end,
        email,
        doctor,
        doctor_email,
        user,
        health_issue
    ) => {
        try {
            // Create a transporter for sending email using Gmail
            const transporter = nodemailer.createTransport({
                service: process.env.EMAIL_HOST,
                auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
                },
            });

            // Remove the day of the week
            const date = appointment_day.split(" ").slice(1).join(" ");

            // Reformat the date to a recognized format (YYYY-MM-DD)
            const [day, month, year] = date.split("/");
            const reformatted_Date = `${year}-${month}-${day}`;

            // Create date object
            const utc_Time_Start = new Date(
                `${reformatted_Date} ${appointment_time_start}`
            );

            // UTC off-set
            const timeZoneOffset = 7 * 60 * 60 * 1000; // UTC+7 
            const local_Time = new Date(utc_Time_Start.getTime() + timeZoneOffset);

            const appointment_Date = `${local_Time.getDate()} - ${local_Time.getMonth() + 1} - ${local_Time.getFullYear()}`;

            // Render the ejs content
            const email_Content = await ejs.renderFile(
                path.join(__dirname, "../views", "appointment-notice.ejs"), {
                doctor,
                appointment_day,
                appointment_time_start: appointment_time_start,
                appointment_time_end: appointment_time_end,
            });

            const email_Content_Doctor = await ejs.renderFile(
                path.join(__dirname, "../views", "appointment-notice-doctor.ejs"), {
                user: user.username,
                appointment_day,
                appointment_time_start: appointment_time_start,
                appointment_time_end: appointment_time_end,
                health_status: health_issue,
                underlying_condition: user.underlying_condition,
                phone: user.phone,
            });

            // Send the email
            let mail_Options = {
                from: process.env.EMAIL,
                to: email,
                subject: "Nhắc lịch hẹn khám",
                html: email_Content,
            };

            let mail_Options_Doctor = {
                from: process.env.EMAIL,
                to: doctor_email,
                subject: "Nhắc lịch hẹn khám",
                html: email_Content_Doctor,
            };

            await Promise.all([
                transporter.sendMail(mail_Options),
                transporter.sendMail(mail_Options_Doctor),
            ]);
        } catch (error) {
            console.error("Error while sending email:", error.message);
            throw new Error("Can not send email");
        }
    };

    send_Appointment_Cancellation_Notice_Mail = async (
        appointment_day,
        appointment_time_start,
        appointment_time_end,
        email,
        doctor,
        doctor_email,
        user
    ) => {
        try {
            // Create a transporter for sending email using Gmail
            const transporter = nodemailer.createTransport({
                service: process.env.EMAIL_HOST,
                auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
                },
            });

            // Remove the day of the week
            const date = appointment_day.split(" ").slice(1).join(" ");

            // Reformat the date to a recognized format (YYYY-MM-DD)
            const [day, month, year] = date.split("/");
            const reformatted_Date = `${year}-${month}-${day}`;

            // Create date object
            const utc_Time_Start = new Date(
                `${reformatted_Date} ${appointment_time_start}`
            );

            // UTC off-set
            const timeZoneOffset = 7 * 60 * 60 * 1000; // UTC+7 
            const local_Time = new Date(utc_Time_Start.getTime() + timeZoneOffset);

            const appointment_Date = `${local_Time.getDate()} - ${local_Time.getMonth() + 1} - ${local_Time.getFullYear()}`;

            // Render the ejs content
            const email_Content = await ejs.renderFile(
                path.join(__dirname, "../views", "cancel-appointment-notice.ejs"),{
                doctor,
                appointment_Date,
                appointment_time_start: appointment_time_start,
                appointment_time_end: appointment_time_end,
            });

            const email_Content_Doctor = await ejs.renderFile(
                path.join(__dirname, "../views", "cancel-appointment-notice-doctor.ejs"),{
                doctor,
                user: user.username,
                appointment_Date,
                appointment_time_start: appointment_time_start,
                appointment_time_end: appointment_time_end,
            });

            // Send the email
            let mail_Options = {
                from: process.env.EMAIL,
                to: email,
                subject: "Huỷ lịch hẹn khám",
                html: email_Content,
            };

            let mail_Options_Doctor = {
                from: process.env.EMAIL,
                to: doctor_email,
                subject: "Huỷ lịch hẹn khám",
                html: email_Content_Doctor,
            };

            await Promise.all([
                transporter.sendMail(mail_Options),
                transporter.sendMail(mail_Options_Doctor),
            ]);
        } catch (error) {
            console.error("Error while sending email:", error.message);
            throw new Error("Can not send email");
        }
    };    check_Appointment_time = async (
        doctor_id,
        appointment_day,
        appointment_time_start,
        appointment_time_end
    ) => {
        console.log("Checking appointment time availability for:", {
            doctor_id,
            appointment_day,
            time: `${appointment_time_start} - ${appointment_time_end}`
        });
        
        // First check existing appointments
        const existing_appointments = await Appointment.find({
            doctor_id,
            appointment_day,
            appointment_time_start,
            appointment_time_end,
        });

        const counter = existing_appointments.length;
        console.log(`Found ${counter} existing appointment(s) for this slot`);

        const doctor = await Doctor.findById(doctor_id).select("active_hours");

        if (!doctor) {
            throw new Error("Doctor schedule not found");
        }
          // Parse appointment_day to extract day of week and specific date if present
        const day_Of_Week = appointment_day.split(" ")[0];
        const appointmentParts = appointment_day.split(" ");
        const isSpecificDate = appointmentParts.length > 1;
        const specificDate = isSpecificDate ? appointmentParts[1] : null;
        
        console.log("Checking availability:", {
            dayOfWeek: day_Of_Week,
            isSpecificDate,
            specificDate,
            slot: `${appointment_time_start}-${appointment_time_end}`,
            fullAppointmentDay: appointment_day
        });

        
        let doctor_active_hour = null;
        
        if (isSpecificDate) {
            // For specific date appointments, prioritize checking date-specific schedules
            doctor_active_hour = doctor.active_hours.find(
                (active_Hour) =>
                    active_Hour.date === specificDate && // Match specific date first
                    active_Hour.day === day_Of_Week &&
                    active_Hour.start_time === appointment_time_start &&
                    active_Hour.end_time === appointment_time_end
            );
            
            console.log(
                doctor_active_hour 
                ? `Found matching date-specific active hour for ${specificDate}` 
                : `No date-specific active hour found for ${specificDate}, checking regular schedules`
            );
        }
        
        // If no date-specific active hour is found, fall back to day-of-week schedule
        if (!doctor_active_hour) {
            doctor_active_hour = doctor.active_hours.find(
                (active_Hour) =>
                    !active_Hour.date && 
                    active_Hour.day === day_Of_Week &&
                    active_Hour.start_time === appointment_time_start &&
                    active_Hour.end_time === appointment_time_end
            );
              console.log(
                doctor_active_hour 
                ? `Found matching recurring weekly active hour for ${day_Of_Week}` 
                : `No active hours found for ${day_Of_Week} at ${appointment_time_start}-${appointment_time_end}`
            );
        }
        
      
        if (doctor_active_hour && doctor_active_hour.date) {
            console.log(`Found date-specific active hour for: ${specificDate}`);
        } else if (doctor_active_hour) {
            console.log(`Found day-of-week active hour for: ${day_Of_Week}`);
        }

        if (!doctor_active_hour) {
            throw new Error("Doctor is not available at this time");
        }

        if (counter >= doctor_active_hour.appointment_limit) {
            throw new Error("This schedule is fully booked");
        }
    };    add_Appointment = async (req, res) => {
        try {
            const {
                user_id,
                doctor_id,
                appointment_day,
                appointment_time_start,
                appointment_time_end,
                health_issue,
                type_service,
            } = req.body;

            if (
                !user_id ||
                !doctor_id ||
                !appointment_day ||
                !appointment_time_start ||
                !appointment_time_end
            ) {
                throw new Error("Missing information");
            }
            
            // Log for debugging appointment creation
            console.log("Creating appointment with day:", appointment_day);
            
            const appointmentParts = appointment_day.split(" ");
            const dayOfWeek = appointmentParts[0]; 
            const isSpecificDate = appointmentParts.length > 1;
            const specificDate = isSpecificDate ? appointmentParts[1] : null; 
            
            if (isSpecificDate) {
                console.log(`Creating appointment for specific date: ${dayOfWeek} ${specificDate}`);
                
                // Confirm the date is valid
                try {
                    const dateObj = new Date(specificDate);
                    if (isNaN(dateObj.getTime())) {
                        throw new Error("Invalid date format");
                    }
                    
                    // Verify the day of week matches the date
                    const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
                    const actualDayOfWeek = daysOfWeek[dateObj.getDay()];
                    
                    if (dayOfWeek !== actualDayOfWeek) {
                        console.warn(`Warning: Supplied day of week (${dayOfWeek}) doesn't match actual day of week for date ${specificDate} (${actualDayOfWeek})`);
                    }
                } catch (error) {
                    console.error("Date validation error:", error);
                    throw new Error("Invalid date format in appointment_day");
                }
            } else {
                console.log(`Creating recurring appointment for day of week: ${appointment_day}`);
            }

            // Check if the time slot is available
            await this.check_Appointment_time(
                doctor_id,
                appointment_day,
                appointment_time_start,
                appointment_time_end
            );

            const appointment = await Appointment.create({
                user_id,
                doctor_id,
                appointment_day,
                appointment_time_start,
                appointment_time_end,
                health_issue,
                type_service,
            });

            const populated_Appointment = await Appointment.findById(appointment._id)
                .populate(
                    "user_id",
                    "username date_of_birth profile_image email underlying_condition phone"
                )
                .populate("doctor_id", "username email");

            this.send_Appointment_Notice_Mail(
                appointment_day,
                appointment_time_start,
                appointment_time_end,
                populated_Appointment.user_id.email,
                populated_Appointment.doctor_id.username,
                populated_Appointment.doctor_id.email,
                populated_Appointment.user_id,
                health_issue
            ).catch((error) => console.error("Failed to send email:", error));

            res.status(201).json(populated_Appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    update_Appointment_Info = async (req, res) => {
        try {
            const appointment_id = req.params.id;
            const { health_issue, type_service } = req.body;

            // Find and update the appointment
            const appointment = await Appointment.findByIdAndUpdate(
                appointment_id,
                { health_issue, type_service },
                { new: true }
            )
            .populate("user_id", "username date_of_birth profile_image")
            .populate("doctor_id", "username");

            res.status(200).json(appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    change_Appointment_Time = async (req, res) => {
        try {
        const appointment_id = req.params.id;
            const {
                doctor_id,
                appointment_day,
                appointment_time_start,
                appointment_time_end,
            } = req.body;

            if (
                !appointment_time_start ||
                !appointment_time_end ||
                !appointment_day ||
                !doctor_id
            ) {
                throw new Error("Missing information");
            }

            await this.check_Appointment_time(
                doctor_id,
                appointment_day,
                appointment_time_start,
                appointment_time_end
            );

            console.log(appointment_time_start, appointment_time_end);

            const appointment = await Appointment.findByIdAndUpdate(
                appointment_id,
                { appointment_time_start, appointment_time_end },
                { new: true }
            )
            .populate("user_id", "username date_of_birth profile_image")
            .populate("doctor_id", "username");

            res.status(200).json(appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    cancel_Appointment = async (req, res) => {
        try {
            const appointment_id = req.params.id;

            const populated_Appointment = await Appointment.findById(appointment_id)
                .populate(
                "user_id",
                "username email underlying_condition phone"
                )
                .populate("doctor_id", "username email");

            await Appointment.findByIdAndDelete(appointment_id);

            this.send_Appointment_Cancellation_Notice_Mail(
                populated_Appointment.appointment_day,
                populated_Appointment.appointment_time_start,
                populated_Appointment.appointment_time_end,
                populated_Appointment.user_id.email,
                populated_Appointment.doctor_id.username,
                populated_Appointment.doctor_id.email,
                populated_Appointment.user_id
            ).catch((error) => console.error("Failed to send email:", error));

            res.status(200).json({ message: "Appointment is cancelled" });
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    add_Insurance = async (req, res) => {
        try {
            const appointment_id = req.params.id;
            const { name, number, location, exp_date } = req.body;

            const new_Insurance = { name, number, location, exp_date };

            const appointment = await Appointment.findByIdAndUpdate(
                appointment_id,
                { $push: { insurance: new_Insurance } },
                { new: true }
            );

        res.status(201).json(appointment.insurance);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    delete_Insurance = async (req, res) => {
        try {
            const { appointment_id, insurance_id } = req.body;

            const appointment = await Appointment.findById(appointment_id);

            appointment.insurance.pull({ _id: insurance_id });

            await appointment.save();

            res.status(201).json(appointment.insurance);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    update_Insurance = async (req, res) => {
        try {
            const { appointment_id, insurance_id, name, number, location, exp_date } =
                req.body;

            console.log(appointment_id, insurance_id, name, number, location, exp_date)
            console.log("nhim")

            const appointment = await Appointment.findById(appointment_id);

            const insurance = await appointment.insurance.id(insurance_id);

            insurance.name = name;
            insurance.number = number;
            insurance.location = location;
            insurance.exp_date = exp_date;

            await appointment.save();

            const populated_Appointment = await Appointment.findById(appointment._id)
                .populate("user_id", "username date_of_birth profile_image")
                .populate("doctor_id", "username");

            res.status(200).json(populated_Appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    get_All_Appointment = async (req, res) => {
        try {
            const { is_deleted } = req.body;
            let query = {};

            if (is_deleted !== undefined) {
                query.is_deleted = is_deleted;
            }

            const appointments = await Appointment.find(query)
                .populate("user_id", "username date_of_birth profile_image")
                .populate("doctor_id", "username");

            res.status(200).json(appointments);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    get_Appointment_By_User_Id = async (req, res) => {
        try {
            const { is_deleted } = req.body;
            const user_id = req.params.id;

            let query = { user_id };

            if (is_deleted !== undefined) {
                query.is_deleted = is_deleted;
            }

            const appointment = await Appointment.find(query)
                .populate("user_id", "username date_of_birth profile_image")
                .populate("doctor_id", "username");

            res.status(200).json(appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    get_Appointment_Insurance = async (req, res) => {
        try {
            const appointment_id = req.params.id;

            const appointment = await Appointment.findById(
                appointment_id,
                "insurance"
            );

            res.status(200).json(appointment.insurance);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    soft_Delete_Appointment = async (req, res) => {
        try {
            const appointment_id = req.params.id;

            const appointment = await Appointment.findByIdAndUpdate(
                appointment_id,
                { is_deleted: true },
                { new: true }
            );

            res.status(200).json(appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    restore_Appointment = async (req, res) => {
        try {
            const appointment_id = req.params.id;

            const appointment = await Appointment.findByIdAndUpdate(
                appointment_id,
                { is_deleted: false },
                { new: true }
            )
            .populate("user_id", "username date_of_birth profile_image")
            .populate("doctor_id", "username");

            res.status(200).json(appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    get_Appointments_By_Doctor = async (req, res) => {
        try {
            const { is_deleted } = req.body;
            const doctor_id = req.params.id;

            let query = { doctor_id };

            if (is_deleted !== undefined) {
                query.is_deleted = is_deleted;
            }

            const appointment = await Appointment.find(query)
                .populate("user_id", "username date_of_birth profile_image")
                .populate("doctor_id", "username");

            res.status(200).json(appointment);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };

    getAppointmentInfo = async (req, res) => {
        try {
            const appointment_id = req.params.id;
            if (!mongoose.Types.ObjectId.isValid(appointment_id)) {
                return res.status(400).json({ 
                    success: false, 
                    message: "Invalid Appointment ID format" 
                });
            }

            const appointmentData = await Appointment.findById(appointment_id);
            res.json({ success: true, appointmentData });
        } catch (error) {
            console.log(error);
            res.json({ success: false, message: error.message });
        }
    };

    getAppointmentCountByMonth = async (req, res) => {
        try {
            const { year } = req.body;
            const selectedYear = year || new Date().getFullYear();

            const result = await Appointment.aggregate([
                {
                $addFields: {
                    formattedDate: {
                    $trim: {
                        input: {
                        $arrayElemAt: [{ $split: ["$appointment_day", " "] }, 1],
                        },
                    },
                    },
                },
                },
                {
                $addFields: {
                    date: {
                    $dateFromString: {
                        dateString: "$formattedDate",
                        format: "%Y-%m-%d",
                    },
                    },
                },
                },
                {
                $addFields: {
                    year: { $year: "$date" },
                    yearMonth: { $dateToString: { format: "%Y-%m", date: "$date" } },
                },
                },
                {
                // Filter appointments by the specified year
                $match: { year: parseInt(selectedYear, 10) },
                },
                {
                $group: {
                    _id: "$yearMonth",
                    appointmentCount: { $sum: 1 },
                },
                },
                {
                $sort: { _id: 1 },
                },
                {
                $project: {
                    _id: 0,
                    month: "$_id",
                    appointmentCount: 1,
                },
                },
            ]);

            if (!result.length) {
                return res
                .status(404)
                .json({ message: "No appointments found for the selected year." });
            }

            return res.status(200).json({ data: result });
        } catch (err) {
        console.error("Error:", err);
            return res.status(500).json({
                error: "An error occurred.",
            });
        }
    };

    getAllUserAppointments = async (req, res) => {
        try {
            const user_id = req.params.id;

            let query = { user_id };

            const appointments = await Appointment.find(query)
                .populate("user_id", "username date_of_birth profile_image")
                .populate({
                path: "doctor_id",
                select: "email username profile_image address",
                populate: {
                    path: "speciality_id",
                    select: "name _id",
                },
                });
            // .populate('doctor_id.speciality_id', '_id name');

            res.status(200).json(appointments);
        } catch (error) {
            res.status(400).json({ error: error.message });
        }
    };
}

module.exports = new appointment_Controller();
