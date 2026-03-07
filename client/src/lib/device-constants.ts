import type { Icon } from '@phosphor-icons/react'

import {
	CookingPotIcon,
	FanIcon,
	FlowerIcon,
	LightbulbIcon,
	MonitorIcon,
	MusicNoteIcon,
	PackageIcon,
	PlugIcon,
	RobotIcon,
	BroadcastIcon,
	SnowflakeIcon,
	SpeakerHifiIcon,
	ThermometerIcon,
	WashingMachineIcon,
} from '@phosphor-icons/react'

export const BRAND_LABEL: Record<string, string> = {
	aqara: 'Aqara',
	elgato: 'Elgato',
	eufy: 'Eufy',
	ge: 'GE',
	govee: 'Govee',
	hue: 'Hue',
	lg: 'LG',
	resideo: 'Resideo',
	samsung: 'Samsung',
	smartthings: 'SmartThings',
	sonos: 'Sonos',
	vesync: 'VeSync',
}

export const TYPE_ICON: Record<string, Icon> = {
	light: LightbulbIcon,
	switch: PlugIcon,
	thermostat: ThermometerIcon,
	air_purifier: FanIcon,
	sensor: BroadcastIcon,
	vacuum: RobotIcon,
	washer_dryer: WashingMachineIcon,
	dishwasher: FlowerIcon,
	oven: CookingPotIcon,
	fridge: SnowflakeIcon,
	tv: MonitorIcon,
	media_player: MusicNoteIcon,
}

export const BRAND_ICON: Record<string, Icon> = {
	hue: LightbulbIcon,
	govee: FlowerIcon,
	vesync: FanIcon,
	lg: MonitorIcon,
	ge: LightbulbIcon,
	aqara: BroadcastIcon,
	smartthings: PlugIcon,
	resideo: ThermometerIcon,
	elgato: LightbulbIcon,
	sonos: SpeakerHifiIcon,
}

export const FALLBACK_ICON: Icon = PackageIcon
