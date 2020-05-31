const express = require("express");
const mongoose = require("mongoose");
const dns = require("dns");

// Init project
const app = express();

// Database config
const mongoURI =
	"mongodb+srv://admin:Mordoklej1@fcc-to5px.mongodb.net/test?retryWrites=true&w=majority";
mongoose.connect(mongoURI, { useNewUrlParser: true, useUnifiedTopology: true });

// ---------- Middleware ----------

// Enable CORS so that your API is remotely testable by FCC
const cors = require("cors");
app.use(cors({ optionSuccessStatus: 200 })); // some legacy browsers choke on 204

// Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Static files
app.use(express.static("public"));
app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

// Not found middleware
// app.use((req, res, next) => {
// 	return next({ status: 404, message: "not found" });
// });

// Error Handling middleware
app.use((err, req, res, next) => {
	let errCode, errMessage;

	if (err.errors) {
		// mongoose validation error
		errCode = 400; // bad request
		const keys = Object.keys(err.errors);
		// report the first validation error
		errMessage = err.errors[keys[0]].message;
	} else {
		// generic or custom error
		errCode = err.status || 500;
		errMessage = err.message || "Internal Server Error";
	}
	res.status(errCode).type("txt").send(errMessage);
});

// ---------- Timestamp microservice ----------

app.get("/api/timestap/", function (req, res) {
	const date = new Date();
	res.json({ unix: date.getTime(), utc: date.toUTCString() });
});

app.get("/api/timestap/:date_string", function (req, res) {
	const dateString = req.params.date_string;
	const date = new Date(dateString);
	if (isNaN(date.getTime())) return res.json({ error: "Invalid Date" });
	res.json({ unix: date.getTime(), utc: date.toUTCString() });
});

// ---------- WhoAmI microservice ----------

app.get("/api/whoami", function (req, res) {
	const ipaddress = req.ip;
	const language = req.header("Accept-Language");
	const software = req.header("User-Agent");
	res.json({ ipaddress, language, software });
});

// ---------- URL shortener ----------

const urlSchema = new mongoose.Schema({
	original_url: String,
	short_url: String,
});

const Url = mongoose.model("Url", urlSchema);

app.post("/api/shorturl/new/:url(*)", (req, res) => {
	const original_url = req.params.url;

	// Validate link
	const lookupUrl = original_url.replace(/^(https?:\/\/)|(www[.])/, "");
	dns.lookup(lookupUrl, (err) => {
		if (err) return res.json({ error: "invalid URL" });

		// Create short_url
		Url.find()
			.then((data) => {
				const short_url = data.length.toString();

				// Save doc in DB
				const doc = new Url({ original_url, short_url });
				doc
					.save()
					.then(() => {
						res.json({ original_url, short_url });
					})
					.catch((err) => {
						res.json({ error: "Database .save() failed: " + err });
					});
			})
			.catch((err) => {
				res.json({ error: "Database .find() failed: " + err });
			});
	});
});

app.get("/api/shorturl/:short_url", (req, res) => {
	// find url in DB
	const short_url = req.params.short_url.toString();
	console.log(short_url);
	Url.findOne({ short_url: short_url })
		.then((data) => {
			// redirect to original_url
			res.redirect(301, data.original_url);
		})
		.catch((err) => {
			res.json({ error: "Database .find() failed: " + err });
		});
});

// ---------- Exercise Tracker ----------

const userSchema = new mongoose.Schema({
	username: String,
	userId: String,
	log: [
		{
			description: String,
			duration: String,
			date: Date,
		},
	],
});

const User = mongoose.model("User", userSchema);

// aux
function dateFromString(str) {
	if (!str) return new Date();
	const date = str.split("-");
	return new Date(date[0], date[1], date[2]);
}

// POST new user
app.post("/api/exercise/new-user", (req, res) => {
	const { username } = req.body;
	const newUser = new User({ username });
	newUser
		.save()
		.then((data) => {
			res.json({ username, _id: data._id });
		})
		.catch((err) => "Database error adding user: " + err);
});

// GET all users
app.get("/api/exercise/users", (req, res) => {
	User.find()
		.then((users) => {
			res.json({ users });
		})
		.catch((err) => res.send(err));
});

// POST an exercise
app.post("/api/exercise/add", (req, res) => {
	let { userId, description, duration, date } = req.body;

	date = dateFromString(date);

	User.findById(userId, (error, user) => {
		if (error) return res.json({ error });
		user.log.push({ userId, description, duration, date });
		user.save().then((user) => {
			res.json(user);
		});
	});
});

// GET /api/exercise/log?{userId}[&from][&to][&limit]
app.get("/api/exercise/log", (req, res) => {
	const { userId, from, to, limit } = req.query;

	if (from) from = dateFromString(from).getTime();
	if (to) to = dateFromString(to).getTime();
	if (limit) limit = Number(limit);

	console.log(userId, from, to, limit);

	User.findById(userId)
		.then((user) => {
			user.userId = user.id;
			user.count = user.log.length;
			user.log = user.log.filter((entry) => {
				console.log(entry.date.getTime(), from, to);

				const isFrom = from ? entry.date.getTime() >= from : true;
				const isTo = to ? entry.date.getTime() <= to : true;
				return isFrom && isTo;
			});
			if (limit && count > limit) user.log.length = limit;

			res.json(user);
		})
		.catch((err) => res.json({ err }));
});

// ====================================================================

// Listen for requests
const listener = app.listen(process.env.PORT || 5000, function () {
	console.log("Your app is listening on port " + listener.address().port);
});
