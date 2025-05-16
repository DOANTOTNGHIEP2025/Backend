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

    const account_active_hours = await this.findById(account_Id, {active_hours: 1})

    const existing_Times = account_active_hours?.active_hours || []

    if(!existing_Times || existing_Times.length === 0){ // no existing time frame
        return false // no overlapping time frame
    }

    const new_Start = new_time.start_time.split(':')
    const new_End = new_time.end_time.split(':')

    const new_Range = moment.range(
        moment().set({ hours: new_Start[0], minutes: new_Start[1] }),
        moment().set({ hours: new_End[0], minutes: new_End[1] })
    ) 

    for(let existing_Time of existing_Times){

        // Skip if different day or type or date
        if (existing_Time.day !== new_time.day || existing_Time.hour_type !== new_time.hour_type) {
            continue
        }
        
        // If dates are provided, check if they are different
        if (existing_Time.date && new_time.date && existing_Time.date !== new_time.date) {
            continue // skip if different specific dates
        }

        if(excluded_time.day === existing_Time.day 
           && excluded_time.start_time === existing_Time.start_time 
           && excluded_time.end_time === existing_Time.end_time
           && excluded_time.hour_type === existing_Time.hour_type
           && ((!excluded_time.date && !existing_Time.date) || excluded_time.date === existing_Time.date)
        ){
            continue // skip a day for updating
        }
        
        let existing_Start = existing_Time.start_time.split(':') // get hours and minutes
        let existing_End = existing_Time.end_time.split(':') // get hours and minutes

        let existing_Range = moment.range(
            moment().set({hours: existing_Start[0], minutes: existing_Start[1]}),
            moment().set({ hours: existing_End[0], minutes: existing_End[1] })
        )

        if(existing_Range.overlaps(new_Range)){
            return true // time frames overlap
        }
        
    }

    return false
}

const Doctor = User.discriminator("Doctor", Doctor_Schema)

module.exports = Doctor
