use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Position, WebviewWindow};

use crate::local_data::PresenceWindowPosition;

const PRESENCE_MARGIN: i32 = 18;

#[derive(Debug, Clone, PartialEq, Eq)]
struct PresencePlacement {
    x: i32,
    y: i32,
    anchor: PresenceAnchor,
    display_id: Option<String>,
    source: PresencePlacementSource,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PresenceAnchor {
    BottomRight,
    BottomLeft,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PresencePlacementSource {
    Default,
    Saved,
    Clamped,
}

#[derive(Debug, Clone)]
struct PresenceDisplay {
    id: Option<String>,
    work_area: PhysicalRect<i32, u32>,
}

fn default_presence_placement(
    work_area: PhysicalRect<i32, u32>,
    window_size: PhysicalSize<u32>,
) -> PresencePlacement {
    let window_width = window_size.width as i32;
    let window_height = window_size.height as i32;
    let work_x = work_area.position.x;
    let work_y = work_area.position.y;
    let work_width = work_area.size.width as i32;
    let work_height = work_area.size.height as i32;
    let bottom_y = work_y + work_height - window_height - PRESENCE_MARGIN;
    let preferred_x = work_x + work_width - window_width - PRESENCE_MARGIN;

    if preferred_x >= work_x + PRESENCE_MARGIN {
        PresencePlacement {
            x: preferred_x,
            y: bottom_y.max(work_y + PRESENCE_MARGIN),
            anchor: PresenceAnchor::BottomRight,
            display_id: None,
            source: PresencePlacementSource::Default,
        }
    } else {
        PresencePlacement {
            x: work_x + PRESENCE_MARGIN,
            y: bottom_y.max(work_y + PRESENCE_MARGIN),
            anchor: PresenceAnchor::BottomLeft,
            display_id: None,
            source: PresencePlacementSource::Default,
        }
    }
}

pub fn configure_floating_presence_window(
    window: &WebviewWindow,
    saved_position: Option<PresenceWindowPosition>,
) -> tauri::Result<()> {
    reinforce_presence_window_layer(window)?;
    window.set_visible_on_all_workspaces(false)?;
    configure_active_space_following(window)?;

    if let Some(placement) = placement_for_window(window, saved_position)? {
        window.set_position(Position::Physical(PhysicalPosition {
            x: placement.x,
            y: placement.y,
        }))?;
    }

    Ok(())
}

pub fn reinforce_presence_window_layer(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    Ok(())
}

pub fn enrich_presence_window_position(
    window: &WebviewWindow,
    mut position: PresenceWindowPosition,
) -> tauri::Result<PresenceWindowPosition> {
    if position.display_id.is_none() {
        position.display_id = window
            .current_monitor()?
            .and_then(|monitor| monitor_id(&monitor));
    }

    Ok(position)
}

fn placement_for_window(
    window: &WebviewWindow,
    saved_position: Option<PresenceWindowPosition>,
) -> tauri::Result<Option<PresencePlacement>> {
    let displays = presence_displays(window)?;
    let current_display_id = window
        .current_monitor()?
        .and_then(|monitor| monitor_id(&monitor));
    let primary_display_id = window
        .primary_monitor()?
        .and_then(|monitor| monitor_id(&monitor));

    Ok(resolve_presence_placement(
        saved_position,
        &displays,
        current_display_id.as_deref(),
        primary_display_id.as_deref(),
        window.outer_size()?,
    ))
}

fn presence_displays(window: &WebviewWindow) -> tauri::Result<Vec<PresenceDisplay>> {
    window.available_monitors().map(|monitors| {
        monitors
            .into_iter()
            .map(|monitor| PresenceDisplay {
                id: monitor_id(&monitor),
                work_area: *monitor.work_area(),
            })
            .collect()
    })
}

fn monitor_id(monitor: &tauri::Monitor) -> Option<String> {
    monitor.name().map(ToOwned::to_owned)
}

fn resolve_presence_placement(
    saved_position: Option<PresenceWindowPosition>,
    displays: &[PresenceDisplay],
    active_display_id: Option<&str>,
    primary_display_id: Option<&str>,
    window_size: PhysicalSize<u32>,
) -> Option<PresencePlacement> {
    if displays.is_empty() {
        return None;
    }

    let default_display = display_by_unique_id(displays, active_display_id)
        .or_else(|| display_by_unique_id(displays, primary_display_id))
        .unwrap_or(&displays[0]);

    let Some(saved_position) = saved_position else {
        let mut placement = default_presence_placement(default_display.work_area, window_size);
        placement.display_id = default_display.id.clone();
        return Some(placement);
    };

    let saved_display = display_containing_position(displays, saved_position.x, saved_position.y)
        .or_else(|| {
            saved_position
                .display_id
                .as_deref()
                .and_then(|display_id| display_by_unique_id(displays, Some(display_id)))
        })
        .unwrap_or(default_display);

    let (x, y) = clamp_position_to_display(
        PhysicalPosition {
            x: saved_position.x,
            y: saved_position.y,
        },
        saved_display.work_area,
        window_size,
    );
    let source = if x == saved_position.x && y == saved_position.y {
        PresencePlacementSource::Saved
    } else {
        PresencePlacementSource::Clamped
    };

    Some(PresencePlacement {
        x,
        y,
        anchor: PresenceAnchor::BottomRight,
        display_id: saved_display.id.clone(),
        source,
    })
}

fn display_by_unique_id<'a>(
    displays: &'a [PresenceDisplay],
    display_id: Option<&str>,
) -> Option<&'a PresenceDisplay> {
    let display_id = display_id?;

    let mut matches = displays
        .iter()
        .filter(|display| display.id.as_deref() == Some(display_id));
    let display = matches.next()?;

    if matches.next().is_none() {
        Some(display)
    } else {
        None
    }
}

fn display_containing_position(
    displays: &[PresenceDisplay],
    x: i32,
    y: i32,
) -> Option<&PresenceDisplay> {
    displays.iter().find(|display| {
        let area = display.work_area;
        let left = area.position.x;
        let top = area.position.y;
        let right = left + area.size.width as i32;
        let bottom = top + area.size.height as i32;

        x >= left && x < right && y >= top && y < bottom
    })
}

fn clamp_position_to_display(
    position: PhysicalPosition<i32>,
    work_area: PhysicalRect<i32, u32>,
    window_size: PhysicalSize<u32>,
) -> (i32, i32) {
    let min_x = work_area.position.x + PRESENCE_MARGIN;
    let min_y = work_area.position.y + PRESENCE_MARGIN;
    let max_x = work_area.position.x + work_area.size.width as i32
        - window_size.width as i32
        - PRESENCE_MARGIN;
    let max_y = work_area.position.y + work_area.size.height as i32
        - window_size.height as i32
        - PRESENCE_MARGIN;

    (
        position.x.clamp(min_x, max_x.max(min_x)),
        position.y.clamp(min_y, max_y.max(min_y)),
    )
}

#[cfg(target_os = "macos")]
fn configure_active_space_following(window: &WebviewWindow) -> tauri::Result<()> {
    use objc2_app_kit::{NSWindow, NSWindowAnimationBehavior};

    let ns_window = window.ns_window()?;

    unsafe {
        let ns_window: &NSWindow = &*ns_window.cast();
        let behavior = ns_window.collectionBehavior();

        ns_window.setCollectionBehavior(active_space_collection_behavior(behavior));
        ns_window.setAnimationBehavior(NSWindowAnimationBehavior::UtilityWindow);
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn active_space_collection_behavior(
    behavior: objc2_app_kit::NSWindowCollectionBehavior,
) -> objc2_app_kit::NSWindowCollectionBehavior {
    use objc2_app_kit::NSWindowCollectionBehavior;

    (behavior | NSWindowCollectionBehavior::MoveToActiveSpace)
        - NSWindowCollectionBehavior::CanJoinAllSpaces
}

#[cfg(not(target_os = "macos"))]
fn configure_active_space_following(_window: &WebviewWindow) -> tauri::Result<()> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn work_area(x: i32, y: i32, width: u32, height: u32) -> PhysicalRect<i32, u32> {
        PhysicalRect {
            position: PhysicalPosition { x, y },
            size: PhysicalSize { width, height },
        }
    }

    fn window_size(width: u32, height: u32) -> PhysicalSize<u32> {
        PhysicalSize { width, height }
    }

    fn display(id: &str, x: i32, y: i32, width: u32, height: u32) -> PresenceDisplay {
        PresenceDisplay {
            id: Some(id.to_string()),
            work_area: work_area(x, y, width, height),
        }
    }

    fn saved_position(
        x: i32,
        y: i32,
        display_id: Option<&str>,
    ) -> crate::local_data::PresenceWindowPosition {
        crate::local_data::PresenceWindowPosition {
            x,
            y,
            display_id: display_id.map(str::to_string),
        }
    }

    #[test]
    fn default_presence_placement_favors_bottom_right() {
        let placement =
            default_presence_placement(work_area(0, 25, 1440, 875), window_size(320, 560));

        assert_eq!(
            placement,
            PresencePlacement {
                x: 1102,
                y: 322,
                anchor: PresenceAnchor::BottomRight,
                display_id: None,
                source: PresencePlacementSource::Default,
            }
        );
    }

    #[test]
    fn default_presence_placement_falls_back_to_bottom_left_when_right_anchor_would_overflow() {
        let placement =
            default_presence_placement(work_area(0, 25, 340, 875), window_size(320, 560));

        assert_eq!(
            placement,
            PresencePlacement {
                x: 18,
                y: 322,
                anchor: PresenceAnchor::BottomLeft,
                display_id: None,
                source: PresencePlacementSource::Default,
            }
        );
    }

    #[test]
    fn default_presence_placement_stays_inside_short_work_area() {
        let placement =
            default_presence_placement(work_area(0, 25, 1440, 500), window_size(320, 560));

        assert_eq!(placement.y, 43);
        assert_eq!(placement.anchor, PresenceAnchor::BottomRight);
    }

    #[test]
    fn resolves_default_position_on_active_display() {
        let placement = resolve_presence_placement(
            None,
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some("sidecar"),
            Some("built-in"),
            window_size(260, 280),
        )
        .expect("default placement");

        assert_eq!(placement.x, 2442);
        assert_eq!(placement.y, 602);
        assert_eq!(placement.display_id.as_deref(), Some("sidecar"));
        assert_eq!(placement.source, PresencePlacementSource::Default);
    }

    #[test]
    fn keeps_saved_position_on_matching_display_when_visible() {
        let placement = resolve_presence_placement(
            Some(saved_position(1620, 520, Some("sidecar"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some("built-in"),
            Some("built-in"),
            window_size(260, 280),
        )
        .expect("saved placement");

        assert_eq!(placement.x, 1620);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("sidecar"));
        assert_eq!(placement.source, PresencePlacementSource::Saved);
    }

    #[test]
    fn clamps_saved_position_to_matching_display_when_offscreen() {
        let placement = resolve_presence_placement(
            Some(saved_position(4000, -200, Some("sidecar"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some("built-in"),
            Some("built-in"),
            window_size(260, 280),
        )
        .expect("clamped placement");

        assert_eq!(placement.x, 2442);
        assert_eq!(placement.y, 18);
        assert_eq!(placement.display_id.as_deref(), Some("sidecar"));
        assert_eq!(placement.source, PresencePlacementSource::Clamped);
    }

    #[test]
    fn clamps_saved_position_to_active_display_when_saved_display_is_missing() {
        let placement = resolve_presence_placement(
            Some(saved_position(2480, 520, Some("disconnected"))),
            &[display("built-in", 0, 25, 1440, 875)],
            Some("built-in"),
            Some("built-in"),
            window_size(260, 280),
        )
        .expect("fallback placement");

        assert_eq!(placement.x, 1162);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("built-in"));
        assert_eq!(placement.source, PresencePlacementSource::Clamped);
    }

    #[test]
    fn migrates_legacy_saved_position_without_display_identity_by_containing_display() {
        let placement = resolve_presence_placement(
            Some(saved_position(1500, 520, None)),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some("built-in"),
            Some("built-in"),
            window_size(260, 280),
        )
        .expect("migrated placement");

        assert_eq!(placement.x, 1500);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("sidecar"));
        assert_eq!(placement.source, PresencePlacementSource::Saved);
    }

    #[test]
    fn prefers_containing_display_over_duplicate_saved_display_identity() {
        let placement = resolve_presence_placement(
            Some(saved_position(1500, 520, Some("Studio Display"))),
            &[
                display("Studio Display", 0, 25, 1440, 875),
                display("Studio Display", 1440, 0, 1280, 900),
            ],
            Some("Studio Display"),
            Some("Studio Display"),
            window_size(260, 280),
        )
        .expect("duplicate-name placement");

        assert_eq!(placement.x, 1500);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("Studio Display"));
        assert_eq!(placement.source, PresencePlacementSource::Saved);
    }

    #[test]
    fn ignores_duplicate_saved_display_identity_when_position_is_offscreen() {
        let placement = resolve_presence_placement(
            Some(saved_position(4000, 520, Some("Studio Display"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("Studio Display", 1440, 0, 1280, 900),
                display("Studio Display", 2720, 0, 1280, 900),
            ],
            Some("built-in"),
            Some("built-in"),
            window_size(260, 280),
        )
        .expect("fallback placement");

        assert_eq!(placement.x, 1162);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("built-in"));
        assert_eq!(placement.source, PresencePlacementSource::Clamped);
    }

    #[test]
    fn returns_none_when_no_display_geometry_is_available() {
        assert_eq!(
            resolve_presence_placement(
                Some(saved_position(1500, 520, None)),
                &[],
                None,
                None,
                window_size(260, 280),
            ),
            None
        );
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn active_space_behavior_moves_to_active_space_without_joining_all_spaces() {
        use objc2_app_kit::NSWindowCollectionBehavior;

        let behavior = active_space_collection_behavior(
            NSWindowCollectionBehavior::CanJoinAllSpaces
                | NSWindowCollectionBehavior::FullScreenAuxiliary,
        );

        assert!(behavior.contains(NSWindowCollectionBehavior::MoveToActiveSpace));
        assert!(!behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
    }
}
