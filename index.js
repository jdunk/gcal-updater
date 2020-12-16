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
        count: parseInt(evNamePieces[0], 10) || 0,
      };
    }
  });
};

const getCurrEvent = (successCallback) => {
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

      successCallback();
    }
  );
};

const addToCurrTotal = (num, successCallback, errorCallback) => {
  gcal.events.update(
    {
      calendarId: config.calendarId,
      eventId: currEvent.id,
      resource: {
        ...currEvent,
        summary: `${num + currEvent.count} ${config.countedItemName}`,
        description: !currEvent.description ? num : `${currEvent.description}+${num}`,
      },
    },
    (err, resp) => {
      if (err) {
        errorCallback(`The API returned an error: ${err}`);
        return;
      }

      successCallback(resp);
    }
  );
};

app.get('/add/:num', (req, res, next) => {
  getCurrEvent(() => {

    // Validate input
    const numParamRaw = req.params.num;
    const numParamTypecast = parseInt(req.params.num, 10);

    if (!numParamTypecast || numParamTypecast < 1) {
      res.status(400).send(`"${numParamRaw}" is not a valid number to add`);
      return;
    }

    addToCurrTotal(
      numParamTypecast,
      (resp) => {
        res.send(`Total updated!<br>${resp.data.summary}<br>${resp.data.description}`);
        console.log({ resp });
      },
      (errMsg) => {
        res.send(`Error: ${errMsg}`);
      }
    );
  });
});

app.get('/', (req, res, next) => {
  getCurrEvent(() => {
    res.send(`Current count: <strong>${currEvent.count}</strong> ${config.countedItemName}`);
  });
});

app.listen(2001, () => {
  console.log("Server running on 2001");
});