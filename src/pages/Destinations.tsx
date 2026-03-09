import { useEffect, useState, useRef } from "react";
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  query,
  orderBy,
  serverTimestamp,
  GeoPoint,
} from "firebase/firestore";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import { db, storage } from "../lib/firebase";
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Search,
  MapPin,
  Loader2,
  Upload,
  ImageIcon,
} from "lucide-react";

interface DestinationData {
  id: string;
  name: string;
  information: string;
  trivia: string;
  source: string;
  latlong: string;
  image: string | null;
  imagePath?: string;
  history: string;
  ratings: number[];
  isPopular: boolean;
  createdAt: unknown;

}

const emptyForm = {
  name: "",
  information: "",
  trivia: "",
  source: "",
  latlong: "",
  history: "",
  isPopular: false,
};

// --- GeoPoint helpers ---
function isGeoPointLike(value: unknown): value is { latitude: number; longitude: number } {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).latitude === "number" &&
    typeof (value as Record<string, unknown>).longitude === "number"
  );
}

function formatLatLong(value: unknown): string {
  if (!value) return "";
  if (isGeoPointLike(value)) {
    const lat = value.latitude;
    const lng = value.longitude;
    const latHem = lat >= 0 ? "N" : "S";
    const lngHem = lng >= 0 ? "E" : "W";
    return `[${Math.abs(lat).toFixed(6)}° ${latHem}, ${Math.abs(lng).toFixed(6)}° ${lngHem}]`;
  }
  if (typeof value === "string") return value;
  return String(value);
}

function parseLatLongString(input: string): { lat: number; lng: number } | null {
  if (!input || typeof input !== "string") return null;
  const raw = input.trim().replace(/^\[\s*/, "").replace(/\s*\]$/, "");
  const parts = raw.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  const parseCoord = (text: string, isLat: boolean): number | null => {
    const cleaned = text.replace(/°/g, "").trim();
    const match = cleaned.match(/^([+-]?\d+(?:\.\d+)?)\s*([NSEW])?$/i);
    if (!match) return null;
    let value = Number(match[1]);
    if (!Number.isFinite(value)) return null;
    const hemi = match[2] ? match[2].toUpperCase() : null;
    if (hemi) {
      if (isLat && !["N", "S"].includes(hemi)) return null;
      if (!isLat && !["E", "W"].includes(hemi)) return null;
      const negative = hemi === "S" || hemi === "W";
      value = Math.abs(value) * (negative ? -1 : 1);
    }
    if (isLat && (value < -90 || value > 90)) return null;
    if (!isLat && (value < -180 || value > 180)) return null;
    return value;
  };

  const lat = parseCoord(parts[0], true);
  const lng = parseCoord(parts[1], false);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}

function parseLatLongToGeoPoint(value: string): GeoPoint | null {
  if (!value) return null;
  const parsed = parseLatLongString(value);
  if (!parsed) throw new Error("Invalid latlong format. Use: [14.590597° N, 120.975287° E]");
  return new GeoPoint(parsed.lat, parsed.lng);
}

// --- Image upload helper ---
async function uploadDestinationImage(imageFile: File, destinationName: string) {
  const fileExtension = imageFile.name.split(".").pop();
  const fileName = `${destinationName.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}.${fileExtension}`;
  const storageRef = ref(storage, `destinations/${fileName}`);
  const snapshot = await uploadBytes(storageRef, imageFile);
  const downloadURL = await getDownloadURL(snapshot.ref);
  return { url: downloadURL, path: `destinations/${fileName}` };
}

export default function Destinations() {
  const [destinations, setDestinations] = useState<DestinationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<DestinationData | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const destinationsRef = collection(db, "destinations");

  async function fetchDestinations() {
    setLoading(true);
    try {
      const q = query(destinationsRef, orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => {
        const raw = d.data();
        return {
          id: d.id,
          name: raw.name || "",
          information: raw.information || "",
          trivia: raw.trivia || "",
          source: raw.source || "",
          latlong: formatLatLong(raw.latlong),
          history: raw.history || "",
          image: raw.image || null,
          imagePath: raw.imagePath || undefined,
          ratings: Array.isArray(raw.ratings) ? raw.ratings : [],
          isPopular: Boolean(raw.isPopular),
          createdAt: raw.createdAt,
        } as DestinationData;
      });
      setDestinations(data);
    } catch (err) {
      console.error("Error fetching destinations:", err);
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchDestinations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setImageFile(null);
    setImagePreview(null);
    setError("");
    setModalOpen(true);
  }

  function openEdit(dest: DestinationData) {
    setEditing(dest);
    setForm({
      name: dest.name,
      information: dest.information,
      trivia: dest.trivia,
      source: dest.source,
      latlong: dest.latlong,
      history: dest.history,
      isPopular: dest.isPopular,
    });
    setImageFile(null);
    setImagePreview(dest.image || null);
    setError("");
    setModalOpen(true);
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      let latlong: GeoPoint | null = null;
      if (form.latlong) {
        latlong = parseLatLongToGeoPoint(form.latlong);
      }

      if (editing) {
        // Update
        const docRef = doc(db, "destinations", editing.id);
        const docSnap = await getDoc(docRef);
        const currentData = docSnap.exists() ? docSnap.data() : {};

        let imageData = null;
        if (imageFile) {
          imageData = await uploadDestinationImage(imageFile, form.name);
          // Delete old image
          if (currentData.imagePath) {
            try {
              await deleteObject(ref(storage, currentData.imagePath));
            } catch {
              // ignore
            }
          }
        }

        await updateDoc(docRef, {
          name: form.name,
          information: form.information,
          latlong,
          trivia: form.trivia,
          source: form.source,
          history: form.history,
          isPopular: form.isPopular,
          image: imageFile && imageData ? imageData.url : currentData.image ?? null,
          ...(imageFile && imageData ? { imagePath: imageData.path } : {}),
          ratings: Array.isArray((currentData as { ratings?: unknown }).ratings)
            ? ((currentData as { ratings: number[] }).ratings)
            : [0],
          createdAt: serverTimestamp(),
        });
      } else {
        // Create
        let imageData = null;
        if (imageFile) {
          imageData = await uploadDestinationImage(imageFile, form.name);
        }

        await addDoc(destinationsRef, {
          name: form.name,
          information: form.information,
          latlong,
          trivia: form.trivia,
          source: form.source,
          history: form.history,
          isPopular: form.isPopular,
          image: imageData ? imageData.url : null,
          ...(imageData ? { imagePath: imageData.path } : {}),
          ratings: [0],
          createdAt: serverTimestamp(),
        });
      }

      setModalOpen(false);
      await fetchDestinations();
    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("An error occurred while saving.");
      }
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    try {
      const docRef = doc(db, "destinations", id);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.imagePath) {
          try {
            await deleteObject(ref(storage, data.imagePath));
          } catch {
            // ignore
          }
        }
      }
      await deleteDoc(docRef);
      setDeleteConfirm(null);
      await fetchDestinations();
    } catch (err) {
      console.error("Error deleting:", err);
    }
  }

  const filtered = destinations.filter(
    (d) =>
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.information?.toLowerCase().includes(search.toLowerCase()) ||
      d.source?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Destinations</h1>
          <p className="text-slate-400 mt-1">
            Manage your destination listings ({destinations.length} total)
          </p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          Add Destination
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
        <input
          type="text"
          placeholder="Search destinations..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <MapPin className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg">No destinations found</p>
          <p className="text-slate-500 text-sm mt-1">
            {search ? "Try a different search term" : "Add your first destination to get started"}
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">
                    Image
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">
                    Name
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">
                    Information
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">
                    Latlong
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">
                    Source
                  </th>
                  <th className="text-right text-xs font-semibold text-slate-400 uppercase tracking-wider px-6 py-4">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filtered.map((dest) => (
                  <tr key={dest.id} className="hover:bg-slate-800/50 transition">
                    <td className="px-6 py-4">
                      {dest.image ? (
                        <img
                          src={dest.image}
                          alt={dest.name}
                          className="w-12 h-12 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center">
                          <ImageIcon className="w-5 h-5 text-slate-500" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white font-medium">{dest.name}</p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-300 text-sm truncate max-w-[250px]">
                        {dest.information}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-400 text-xs font-mono">
                        {dest.latlong || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-slate-400 text-sm truncate max-w-[150px]">
                        {dest.source || "—"}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEdit(dest)}
                          className="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition cursor-pointer"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(dest.id)}
                          className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-800">
              <h2 className="text-xl font-bold text-white">
                {editing ? "Edit Destination" : "Add New Destination"}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && (
              <div className="mx-6 mt-4 bg-red-500/20 border border-red-500/50 text-red-300 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Image Upload */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Image
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-slate-700 rounded-xl p-6 text-center cursor-pointer hover:border-blue-500/50 transition"
                >
                  {imagePreview ? (
                    <div className="relative inline-block">
                      <img
                        src={imagePreview}
                        alt="Preview"
                        className="max-h-48 rounded-lg mx-auto object-cover"
                      />
                      <p className="text-slate-400 text-xs mt-2">Click to change image</p>
                    </div>
                  ) : (
                    <div>
                      <Upload className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                      <p className="text-slate-400 text-sm">Click to upload an image</p>
                      <p className="text-slate-500 text-xs mt-1">PNG, JPG, WEBP up to 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="Destination name"
                />
              </div>

              {/* Information */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Information *
                </label>
                <textarea
                  rows={4}
                  required
                  value={form.information}
                  onChange={(e) => setForm({ ...form, information: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                  placeholder="Describe this destination..."
                />
              </div>

              {/* Latlong */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Lat/Long
                </label>
                <input
                  type="text"
                  value={form.latlong}
                  onChange={(e) => setForm({ ...form, latlong: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition font-mono text-sm"
                  placeholder="[14.590597° N, 120.975287° E]"
                />
                <p className="text-slate-500 text-xs mt-1">
                  Format: [lat° N/S, lng° E/W] e.g. [14.590597° N, 120.975287° E]
                </p>
              </div>

              {/* Trivia */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Trivia
                </label>
                <textarea
                  rows={2}
                  value={form.trivia}
                  onChange={(e) => setForm({ ...form, trivia: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                  placeholder="Fun fact or trivia about this destination..."
                />
              </div>

              {/* Source */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Source
                </label>
                <input
                  type="text"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="Source URL or reference"
                />
              </div>

              {/* History */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  History
                </label>
                <textarea
                  rows={3}
                  value={form.history}
                  onChange={(e) => setForm({ ...form, history: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                  placeholder="History of this destination..."
                />
              </div>

              {/* Popular toggle */}
              <div className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">Mark as Popular</p>
                  <p className="text-xs text-slate-400">
                    Highlight this destination as a featured or trending spot.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, isPopular: !form.isPopular })}
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                    form.isPopular ? "bg-blue-500" : "bg-slate-600"
                  }`}
                  aria-pressed={form.isPopular}
                >
                  <span
                    className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition duration-200 ${
                      form.isPopular ? "translate-x-5" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-5 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 text-white font-medium rounded-lg transition flex items-center gap-2 cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editing ? "Update" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-white mb-2">
              Delete Destination
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              Are you sure you want to delete this destination? This will also remove its image from storage. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
