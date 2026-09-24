// The reminder server (a free Cloudflare Worker, see ../notes-push) that wakes the phone when
// a reminder is due, even with the app closed. While these are empty, reminders still pop up,
// but only while the app is open or was used recently.
self.PUSH = {
  url: '',   // e.g. https://notes-reminders.<your-name>.workers.dev
  key: 'BJ8PssMPplcKVQT2EdyQCyCqN-_McJvkUKH-8uEMQ0mbUzin_SeJzse6-ITHIE5pzoZteunNye8GRgxhnu18vWE', // the server's public key
};
