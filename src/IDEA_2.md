Time Metrics
These columns track the duration (formatted as HH:MM:SS) spent in different operational states:

Open Time: The amount of time the driver was online and available to accept new trip requests (waiting for a "ping").

Enroute Time: The time spent traveling to a pickup location after accepting a request.

On Trip Time: The time spent with a passenger or delivery in the vehicle, from pickup to drop-off.

Unavailable Time: The time the driver was logged into the system but marked as "Unavailable" (e.g., taking a break or paused).

Distance Metrics
These columns track the distance covered during each of the states mentioned above:

Open Distance: Distance traveled while the driver was online and waiting for a request.

Enroute Distance: Distance traveled while the driver was heading to the pickup location.

On Trip Distance: Distance traveled during the actual trip (from pickup to destination).

Unavailable Distance: Distance traveled while the driver was in an unavailable or offline-equivalent state.


---




driver_time_and_distance

Driver UUID	Driver First Name	Driver Last Name	Open Time	Enroute Time	On Trip Time	Unavailable Time	Open Distance	Enroute Distance	On Trip Distance	Unavailable Distance
52ff47da-ef48-41b8-93d5-80a09b85ce5b	KENNY GREGORY	RATTRAYCAS	0:10:11	0:15:47	1:14:04	0:00:07	269.58	279.52	799.41	0.03

---

vehicle_time_and_distance

Vehicle UUID	Vehicle License Plate	Open Time	Enroute Time	On Trip Time	Unavailable Time	Open Distance	Enroute Distance	On Trip Distance	Unavailable Distance
a6d3799c-df61-46c4-8f1d-84d3cc0768f4	5179KZ	0:10:11	0:15:47	1:14:04	0:00:07	269.58	279.52	799.41	0.03
