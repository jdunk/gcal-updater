const express = require("express");
const app = express();
const { google } = require('googleapis');
const config = require('./config/default.js')

const scopes = ['https://www.googleapis.com/auth/calendar']

const auth = new google.auth.GoogleAuth({
  keyFile: './gauth.json',
  scopes,
})

const gcal = google.calendar({ version: 'v3', auth })

const now = new Date();

const getStartOfToday = (offsetInMinutes) => {
  const adjNow = new Date(now.getTime() + offsetInMinutes * 60000);

  return new Date(Date.UTC(1900 + adjNow.getYear(), adjNow.getMonth(), adjNow.getDate(), -offsetInMinutes/60));
};

const getStartOfTomorrow = (offsetInMinutes) => {
  const adjNow = new Date(now.getTime() + offsetInMinutes * 60000);

  return new Date(Date.UTC(1900 + adjNow.getYear(), adjNow.getMonth(), adjNow.getDate(), -offsetInMinutes/60, 1));
};

let currEvent;

const gcalEventsListProcess = (resp) => {
  console.log(resp.data.items) // All data
  /*
  const events = resp.data.items.map((ev) => ({
    id: ev.id,
    summary: ev.summary,
    start: ev.start.dateTime || ev.start.date,
    description: ev.description,
  }));

  console.log(events)
  */

  resp.data.items.forEach((ev) => {
    const evNamePieces = ev.summary.split(' ');

    if (evNamePieces.length >= 2 && evNamePieces[1] === config.countedItemName) {
      currEvent = {
        ...ev,
        count: evNamePieces[0],
      };
    }
  });
};

app.get('/', (req, res, next) => {
  currEvent = null;

  gcal.events.list(
    {
      calendarId: config.calendarId,
      timeMin: getStartOfToday(config.timezoneOffsetInMinutes).toISOString(),
      timeMax: getStartOfTomorrow(config.timezoneOffsetInMinutes).toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
    },
    (err, resp) => {
      if (err) {
        console.log(`The API returned an error: ${err}`)
        return;
      }

      gcalEventsListProcess(resp);
    
      if (!currEvent) {
        res.send('no event found for today');
      }
      else {
        res.send(`Current count: <strong>${currEvent.count}</strong> ${config.countedItemName}`);
      }
    }
  );
});

app.listen(2001, () => {
  console.log("Server running");
});