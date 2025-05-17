/**
 * Fix for handling date-specific vs recurring schedules in Doctor model
 * This patch adds additional logging and improves logic for overlap detection
 */

const fixDoctorDateSpecificSchedules = () => {
  console.log("Applying date-specific schedule fixes...");
  
  // Helper function to check if a time range overlaps with existing times
  const checkTimeOverlap = (newTime, existingTime) => {
    // Parse times 
    const newStart = newTime.start_time.split(':').map(Number);
    const newEnd = newTime.end_time.split(':').map(Number);
    const existingStart = existingTime.start_time.split(':').map(Number);
    const existingEnd = existingTime.end_time.split(':').map(Number);
    
    // Determine if there's an overlap
    const newStartMinutes = newStart[0] * 60 + newStart[1];
    const newEndMinutes = newEnd[0] * 60 + newEnd[1];
    const existingStartMinutes = existingStart[0] * 60 + existingStart[1];
    const existingEndMinutes = existingEnd[0] * 60 + existingEnd[1];
    
    // Check for overlap: either new start or end falls within existing range
    // No overlap if new ends before existing starts or new starts after existing ends
    const hasOverlap = !(
      newEndMinutes <= existingStartMinutes || newStartMinutes >= existingEndMinutes
    );
    
    console.log(`Time overlap check: ${newTime.start_time}-${newTime.end_time} vs ${existingTime.start_time}-${existingTime.end_time}: ${hasOverlap ? "OVERLAP" : "NO OVERLAP"}`);
    
    return hasOverlap;
  };
  
  // This function should be added to Doctor model logic
  const isTimeOverlap = (newTime, existingTimes, excludedTime) => {
    console.log("Improved overlap detection running with date-specific awareness...");
    
    // If no existing times, no overlap
    if (!existingTimes || existingTimes.length === 0) {
      return false;
    }
    
    // Group existing times by day and date status
    const timesByDay = {};
    
    existingTimes.forEach(time => {
      if (!timesByDay[time.day]) {
        timesByDay[time.day] = {
          specificDates: {},  // Index by date string
          recurring: []       // Regular weekly times
        };
      }
      
      // Skip if it's the time being updated
      if (excludedTime && 
          excludedTime.day === time.day && 
          excludedTime.start_time === time.start_time && 
          excludedTime.end_time === time.end_time &&
          excludedTime.date === time.date) {
        return;
      }
      
      // Categorize by date-specific vs. recurring
      if (time.date) {
        if (!timesByDay[time.day].specificDates[time.date]) {
          timesByDay[time.day].specificDates[time.date] = [];
        }
        timesByDay[time.day].specificDates[time.date].push(time);
      } else {
        timesByDay[time.day].recurring.push(time);
      }
    });
    
    // Check for overlaps based on the type of new time
    if (newTime.date) {
      // This is a date-specific time
      // Check only against times for the same specific date
      const dayTimes = timesByDay[newTime.day];
      if (!dayTimes) return false;
      
      const specificDateTimes = dayTimes.specificDates[newTime.date] || [];
      
      // Check against other times for this specific date
      for (const time of specificDateTimes) {
        if (checkTimeOverlap(newTime, time)) {
          console.log(`OVERLAP DETECTED: Date-specific overlap on ${newTime.date}`);
          return true;
        }
      }
    } else {
      // This is a recurring time (not date-specific)
      // Check only against other recurring times for the same day of week
      const dayTimes = timesByDay[newTime.day];
      if (!dayTimes) return false;
      
      for (const time of dayTimes.recurring) {
        if (checkTimeOverlap(newTime, time)) {
          console.log(`OVERLAP DETECTED: Recurring schedule overlap on ${newTime.day}`);
          return true;
        }
      }
    }
    
    return false;
  };
  
  return {
    isTimeOverlap,
    checkTimeOverlap
  };
};

module.exports = fixDoctorDateSpecificSchedules;
