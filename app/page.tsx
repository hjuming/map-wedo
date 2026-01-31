'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, MapPin, ExternalLink, Leaf, Utensils, Anchor, Plane, Compass } from 'lucide-react'

// System Types
type Place = {
  id: string
  name: string
  category: 'food' | 'dive' | 'pet' | 'travel'
  subcategory?: string
  location: any // PostGIS point, or string from Supabase
  metadata: any
  google_url?: string
  rating?: number
}

// Category Config
const CATEGORIES = [
  { id: 'all', label: 'All Places', icon: Compass },
  { id: 'food', label: 'Food', icon: Utensils },
  { id: 'dive', label: 'Diving', icon: Anchor },
  { id: 'pet', label: 'Pet Friendly', icon: Leaf },
  { id: 'travel', label: 'Travel', icon: Plane },
]

export default function Home() {
  const [places, setPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => {
    fetchPlaces()
  }, [])

  async function fetchPlaces() {
    setLoading(true)
    // Fetch all for now, we can paginate later if > 1000
    const { data, error } = await supabase
      .from('places')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200) // Safety limit for V1

    if (error) {
      console.error('Error fetching places:', error)
    } else {
      setPlaces(data || [])
    }
    setLoading(false)
  }

  // Derived State
  const filteredPlaces = useMemo(() => {
    return places.filter(place => {
      const matchSearch = place.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        place.metadata?.tags?.some((t: any) => t.toLowerCase().includes(searchTerm.toLowerCase()))

      const matchCategory = activeCategory === 'all' || place.category === activeCategory

      return matchSearch && matchCategory
    })
  }, [places, searchTerm, activeCategory])

  // Helper to get Google Map Link
  const getMapLink = (place: Place) => {
    if (place.google_url) return place.google_url

    // If we have coordinates (PostGIS text representation usually comes as string via REST if not cast, 
    // but Supabase JS client usually returns object or WKT if requested. 
    // Let's assume name search fallback first, or lat/lon if we parse it.)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.name)}`
  }

  const getTags = (place: Place): string[] => {
    const defaultTags = place.metadata?.tags || []
    if (place.subcategory) defaultTags.unshift(place.subcategory)
    return defaultTags.slice(0, 3) // Max 3 tags
  }

  return (
    <main>
      {/* Navbar */}
      <nav className="navbar">
        <div className="container nav-content">
          <div className="brand">
            <Compass size={24} className="text-sky-400" />
            <span>Moltbot Maps</span>
          </div>
          {/* Add User/Login here later */}
        </div>
      </nav>

      <div className="container">

        {/* Controls */}
        <div className="controls-area">
          <div className="search-bar">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Search places, tags..."
              className="search-input"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="filter-tabs">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                className={`tab ${activeCategory === cat.id ? 'active' : ''}`}
                onClick={() => setActiveCategory(cat.id)}
              >
                <cat.icon size={14} style={{ display: 'inline', marginRight: 4 }} />
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="loading-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-card" />
            ))}
          </div>
        ) : (
          <div className="places-grid">
            {filteredPlaces.map(place => (
              <a
                key={place.id}
                href={getMapLink(place)}
                target="_blank"
                rel="noopener noreferrer"
                className={`place-card cat-${place.category}`}
              >
                <div className="card-header">
                  <span className="place-category">{place.category}</span>
                  {place.rating ? (
                    <div className="place-rating">
                      <span>★</span> {place.rating}
                    </div>
                  ) : null}
                </div>

                <div className="card-body">
                  <h3 className="place-name">{place.name}</h3>
                  <p className="place-desc">
                    {place.metadata?.description || place.metadata?.original_description || place.metadata?.notes || "No description available."}
                  </p>

                  <div className="tags-row">
                    {getTags(place).map((tag, idx) => (
                      <span key={idx} className="tag-chip">#{tag}</span>
                    ))}
                  </div>
                </div>

                <div className="card-footer">
                  <span>{place.metadata?.difficulty ? `Difficulty: ${place.metadata.difficulty}` : 'View Details'}</span>
                  <div className="view-btn">
                    <MapPin size={14} />
                    <span>Open Map</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {!loading && filteredPlaces.length === 0 && (
          <div className="text-center py-20 text-slate-500">
            <h3 className="text-xl font-medium mb-2">No places found</h3>
            <p>Try adjusting your search or category.</p>
          </div>
        )}

      </div>
    </main>
  )
}
