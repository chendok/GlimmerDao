import React from 'react'
import ReactDOM from 'react-dom'
import chinaRegions from '../utils/chinaRegions'

interface RegionPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (fullPath: string) => void
}

const RegionPicker: React.FC<RegionPickerProps> = ({ open, onClose, onSelect }) => {
  const [selectedProvince, setSelectedProvince] = React.useState('')
  const [selectedCity, setSelectedCity] = React.useState('')
  const [selectedDistrict, setSelectedDistrict] = React.useState('')

  React.useEffect(() => {
    if (!open) {
      setSelectedProvince('')
      setSelectedCity('')
      setSelectedDistrict('')
    }
  }, [open])

  if (!open) return null

  const currentProvince = chinaRegions.find((p) => p.name === selectedProvince)
  const currentCity = currentProvince?.cities.find((c) => c.name === selectedCity)

  const handleProvinceClick = (provinceName: string) => {
    setSelectedProvince(provinceName)
    setSelectedCity('')
    setSelectedDistrict('')
  }

  const handleCityClick = (cityName: string) => {
    setSelectedCity(cityName)
    setSelectedDistrict('')
    const province = chinaRegions.find((p) => p.name === selectedProvince)
    const city = province?.cities.find((c) => c.name === cityName)
    if (!city || city.districts.length === 0) {
      onSelect(`${selectedProvince} ${cityName}`)
      onClose()
    }
  }

  const handleDistrictClick = (districtName: string) => {
    setSelectedDistrict(districtName)
    onSelect(`${selectedProvince} ${selectedCity} ${districtName}`)
    onClose()
  }

  return ReactDOM.createPortal(
    <div className="bazi-region-overlay" onClick={onClose}>
      <div className="bazi-region-modal" onClick={(e) => e.stopPropagation()}>
        <div className="bazi-region-modal-header">
          <span className="bazi-region-modal-title">选择地点</span>
          <button
            type="button"
            className="bazi-region-modal-close"
            onClick={onClose}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="bazi-region-columns">
          <div className="bazi-region-column">
            <div className="bazi-region-column-header">省份</div>
            <div className="bazi-region-column-list">
              {chinaRegions.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={`bazi-region-item${selectedProvince === p.name ? ' active' : ''}`}
                  onClick={() => handleProvinceClick(p.name)}
                >
                  {p.name}
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div className="bazi-region-column">
            <div className="bazi-region-column-header">
              {selectedProvince ? selectedProvince : '城市'}
            </div>
            <div className="bazi-region-column-list">
              {currentProvince?.cities.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  className={`bazi-region-item${selectedCity === c.name ? ' active' : ''}`}
                  onClick={() => handleCityClick(c.name)}
                >
                  {c.name}
                  {c.districts.length > 0 && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  )}
                </button>
              ))}
              {!selectedProvince && (
                <div className="bazi-region-empty">请先选择省份</div>
              )}
            </div>
          </div>

          <div className="bazi-region-column">
            <div className="bazi-region-column-header">
              {selectedCity ? selectedCity : '区县'}
            </div>
            <div className="bazi-region-column-list">
              {currentCity?.districts.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  className={`bazi-region-item${selectedDistrict === d.name ? ' active' : ''}`}
                  onClick={() => handleDistrictClick(d.name)}
                >
                  {d.name}
                </button>
              ))}
              {selectedProvince && currentProvince?.cities.find((c) => c.name === selectedCity)?.districts.length === 0 && (
                <div className="bazi-region-empty">该城市无下级区县</div>
              )}
              {!selectedCity && selectedProvince && (
                <div className="bazi-region-empty">请选择城市</div>
              )}
              {!selectedProvince && (
                <div className="bazi-region-empty">请先选择省份</div>
              )}
            </div>
          </div>
        </div>

        {(selectedProvince || selectedCity || selectedDistrict) && (
          <div className="bazi-region-selected-preview">
            已选择：{[selectedProvince, selectedCity, selectedDistrict].filter(Boolean).join(' / ')}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}

export default RegionPicker
