import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { MapPin, FileText, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const [destinationCount, setDestinationCount] = useState(0);

  useEffect(() => {
    async function fetchCounts() {
      try {
        const snap = await getDocs(collection(db, "destinations"));
        setDestinationCount(snap.size);
      } catch {
        // collection might not exist yet
      }
    }
    fetchCounts();
  }, []);

  const stats = [
    {
      label: "Total Destinations",
      value: destinationCount,
      icon: MapPin,
      color: "blue",
      bg: "bg-blue-500/20",
      text: "text-blue-400",
    },
    {
      label: "Active Listings",
      value: destinationCount,
      icon: FileText,
      color: "emerald",
      bg: "bg-emerald-500/20",
      text: "text-emerald-400",
    },
    {
      label: "Growth",
      value: `${destinationCount > 0 ? "+" : ""}${destinationCount}`,
      icon: TrendingUp,
      color: "purple",
      bg: "bg-purple-500/20",
      text: "text-purple-400",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">Welcome to your admin panel</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-900 border border-slate-800 rounded-xl p-6 hover:border-slate-700 transition"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${stat.bg}`}>
                <stat.icon className={`w-6 h-6 ${stat.text}`} />
              </div>
            </div>
            <p className="text-3xl font-bold text-white">{stat.value}</p>
            <p className="text-sm text-slate-400 mt-1">{stat.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
