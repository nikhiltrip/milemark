/** Curated event dates, verified against organizer pages on 2026-10-15.
 * This is a starter list, not a live registration or availability service. */
export const races = [
  {
    id: "la-2027",
    name: "Los Angeles Marathon",
    date: "2027-03-07",
    location: "Los Angeles, CA",
    url: "https://www.mccourtfoundation.org/event/los-angeles-marathon/register/",
  },
  {
    id: "tokyo-2027",
    name: "Tokyo Marathon",
    date: "2027-03-07",
    location: "Tokyo, Japan",
    url: "https://www.marathon.tokyo/en/about/outline/",
  },
  {
    id: "boston-2027",
    name: "Boston Marathon",
    date: "2027-04-19",
    location: "Boston, MA",
    url: "https://www.baa.org/races/boston-marathon/",
  },
  {
    id: "sf-2027",
    name: "San Francisco Marathon",
    date: "2027-07-25",
    location: "San Francisco, CA",
    url: "https://www.thesfmarathon.com/full-marathon/",
  },
];
export const upcomingRaces = (today: string) =>
  races
    .filter((r) => r.date > today)
    .sort((a, b) => a.date.localeCompare(b.date));
