const User = require('./User')
const Speciality = require('./Speciality')
const Region = require('./Region')

const Moment = require('moment')
const MomentRange = require('moment-range')
const moment = MomentRange.extendMoment(Moment)

const bcrypt = require('bcrypt')
const validator = require('validator')

const mongoose = require('mongoose')
const Appointment = require('./Appointment')
const Schema = mongoose.Schema

require("dotenv").config()

// const default_profile_img = process.env.DEFAULT_PROFILE_IMG

const Doctor_Schema = new Schema({
    speciality_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Speciality',
        required: false,
    },
    verified:{
        type: Boolean,
        default: false
    },    active_hours: [{
        day: String, // days of week
        start_time: String, // hours:minutes
        end_time: String, // hours:minutes
        hour_type: String, // working or appointment
        appointment_limit: Number, // limit the number of appointments in the time frame
        date: String, // specific date in YYYY-MM-DD format
    }],
    bio: {
        type: String,
        default: 'undisclosed'
    },
    region_id: {
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Region', 
        required: false 
    },
    proof: {
        type: String,
        required: false
    }
})

Doctor_Schema.path('active_hours').default(() => [])

Doctor_Schema.statics.add_Doctor = async function(email, password, username, phone, proof) {
    //validation
    if(!email || !password){
        throw new Error('Cần phải có email và mật khẩu!')
    }
    
    if(!validator.isEmail(email)){
        throw new Error('Email không hợp lệ!')
    }

    if(!validator.isStrongPassword(password)){
        throw new Error('Mật khẩu không đủ mạnh!')
    }

    // if(!validator.isMobilePhone(phone, 'vi-VN')){
    //     throw new Error('Invalid phone number!')
    // }

    const doc_exists = await this.findOne({email})
    const user_exists = await User.findOne({email})

    if(user_exists || doc_exists){
        throw new Error('Email đã tồn tại!')
    }
    //hassing password
    const salt = await bcrypt.genSalt(10)
    const hass = await bcrypt.hash(password, salt)

    const doctor = await this.create({
        email, 
        password: hass, 
        username, 
        phone, 
        proof, 
        profile_image: null})

    return doctor
}

Doctor_Schema.statics.Is_Time_Overlap = async function(new_time, account_Id, excluded_time = {}) {
    // Log for debugging
    console.log("Checking overlap for:", {
        new_time: {
            day: new_time.day,
            time: `${new_time.start_time}-${new_time.end_time}`,
            date: new_time.date || "no specific date"
        },
        excluded_time: excluded_time,
        account_Id: account_Id
    });

    const account_active_hours = await this.findById(account_Id, {active_hours: 1})

    const existing_Times = account_active_hours?.active_hours || []

    if(!existing_Times || existing_Times.length === 0){ // no existing time frame
        console.log("No existing time frames found");
        return false // no overlapping time frame
    }

    const new_Start = new_time.start_time.split(':')
    const new_End = new_time.end_time.split(':')

    const new_Range = moment.range(
        moment().set({ hours: new_Start[0], minutes: new_Start[1] }),
        moment().set({ hours: new_End[0], minutes: new_End[1] })
    ) 

    // Log all existing times for debugging
    console.log("All existing timeframes:", existing_Times.map(t => ({
        day: t.day, 
        time: `${t.start_time}-${t.end_time}`, 
        date: t.date || "recurring weekly"
    })));
    
    for(let existing_Time of existing_Times){
        // Skip the time frame if it's the one we're updating
        if (excluded_time && 
            excluded_time.day === existing_Time.day && 
            excluded_time.start_time === existing_Time.start_time && 
            excluded_time.end_time === existing_Time.end_time &&
            excluded_time.date === existing_Time.date) {
            console.log("Skipping the excluded time frame (the one being updated)");
            continue;
        }
          // Skip if different day or type
        if (existing_Time.day !== new_time.day || existing_Time.hour_type !== new_time.hour_type) {
            console.log(`Skipping: different day or hour type. 
                         Day match: ${existing_Time.day === new_time.day}, 
                         Hour type match: ${existing_Time.hour_type === new_time.hour_type}`);
            continue;
        }
        
        // Improved handling of date-specific vs recurring schedules
          // Case 1: New time is for a specific date
        if (new_time.date) {
            // Only compare with existing times for the same specific date
            // If the existing time has a date, it must match. If existing time is recurring, check the day.
            if (existing_Time.date) {
                // Both have dates - compare them directly
                if (existing_Time.date !== new_time.date) {
                    console.log(`Skipping comparison - different specific dates:
                                New time date: ${new_time.date} (${new_time.day})
                                Existing time date: ${existing_Time.date} (${existing_Time.day})`);
                    continue; // Skip if dates don't match
                }
            } else {
                // Existing time is recurring - make sure the day matches
                if (existing_Time.day !== new_time.day) {
                    console.log(`Skipping comparison - recurring day doesn't match:
                                New time date: ${new_time.date} (${new_time.day})
                                Existing time: recurring every ${existing_Time.day}`);
                    continue;
                }
                // If days match, this is a potential conflict between specific and recurring
                console.log(`⚠️ Potential conflict: new date-specific schedule on ${new_time.date} (${new_time.day}) 
                            conflicts with recurring schedule for ${existing_Time.day}`);
            }
            console.log("✓ Valid comparison - checking overlap for specific date:", new_time.date);
        }
        // Case 2: New time is for a recurring day (not date specific)
        else {
            // If existing time has a specific date, only check if the days match
            if (existing_Time.date) {
                // Get day of week for the specific date
                const dateObj = new Date(existing_Time.date);
                const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                const dayOfWeek = daysOfWeek[dateObj.getDay()];
                
                // If the new recurring schedule day matches the day of the specific date
                if (new_time.day === dayOfWeek) {
                    console.log(`⚠️ Potential conflict: new recurring schedule for ${new_time.day} 
                                affects existing date-specific schedule on ${existing_Time.date} (${dayOfWeek})`);
                } else {
                    console.log(`Skipping comparison - new recurring day doesn't match date-specific day:
                                New time: recurring every ${new_time.day}
                                Existing time: specific date ${existing_Time.date} (${dayOfWeek})`);
                    continue;
                }
            } else if (existing_Time.day !== new_time.day) {
                // Both are recurring, but different days
                console.log(`Skipping comparison - different recurring days:
                            New time: recurring every ${new_time.day}
                            Existing time: recurring every ${existing_Time.day}`);
                continue;
            }
            console.log("✓ Valid comparison - checking overlap for recurring schedules on day:", new_time.day);
        }

        // Skip the time we're updating (if applicable)
        if(excluded_time.day === existing_Time.day 
           && excluded_time.start_time === existing_Time.start_time 
           && excluded_time.end_time === existing_Time.end_time
           && excluded_time.hour_type === existing_Time.hour_type
           && ((!excluded_time.date && !existing_Time.date) || 
               (excluded_time.date && existing_Time.date && excluded_time.date === existing_Time.date))
        ){
            console.log("Skipping the time being updated");
            continue; // skip a day for updating
        }
        
        let existing_Start = existing_Time.start_time.split(':') // get hours and minutes
        let existing_End = existing_Time.end_time.split(':') // get hours and minutes

        let existing_Range = moment.range(
            moment().set({hours: existing_Start[0], minutes: existing_Start[1]}),
            moment().set({ hours: existing_End[0], minutes: existing_End[1] })
        )        // Check for time range overlap
        if(existing_Range.overlaps(new_Range)){
            // Log overlap detection for debugging
            console.log("Overlap detected between:", {
                existing: {
                    day: existing_Time.day,
                    time: `${existing_Time.start_time}-${existing_Time.end_time}`,
                    date: existing_Time.date || "no specific date"
                },
                new: {
                    day: new_time.day,
                    time: `${new_time.start_time}-${new_time.end_time}`,
                    date: new_time.date || "no specific date"
                }
            });
            
            return true // time frames overlap
        }
        
    }

    return false
}

const Doctor = User.discriminator("Doctor", Doctor_Schema)

module.exports = Doctor
