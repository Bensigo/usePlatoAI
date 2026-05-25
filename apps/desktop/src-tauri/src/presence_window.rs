use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Position, WebviewWindow};

use crate::local_data::PresenceWindowPosition;

const PRESENCE_MARGIN: i32 = 18;
#[cfg(target_os = "macos")]
fn macos_companion_overlay_window_level() -> objc2_app_kit::NSWindowLevel {
    (unsafe { core_graphics::display::CGShieldingWindowLevel() } + 1) as _
}

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
    Followed,
}

#[derive(Debug, Clone)]
struct PresenceDisplay {
    id: Option<String>,
    work_area: PhysicalRect<i32, u32>,
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct FocusedWindowRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
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
    window.set_visible_on_all_workspaces(true)?;
    configure_native_companion_overlay(window)?;

    if let Some(placement) = placement_for_window(window, saved_position)? {
        window.set_position(Position::Physical(PhysicalPosition {
            x: placement.x,
            y: placement.y,
        }))?;
    }

    Ok(())
}

pub fn follow_presence_window_to_active_display(
    window: &WebviewWindow,
    saved_position: Option<PresenceWindowPosition>,
) -> tauri::Result<Option<PresenceWindowPosition>> {
    reinforce_presence_window_layer(window)?;

    let Some(placement) = placement_for_window(window, saved_position)? else {
        return Ok(None);
    };

    let current_position = window.outer_position().ok();
    let should_move = current_position
        .as_ref()
        .map(|position| position.x != placement.x || position.y != placement.y)
        .unwrap_or(true);

    if should_move {
        window.set_position(Position::Physical(PhysicalPosition {
            x: placement.x,
            y: placement.y,
        }))?;
    }

    Ok(Some(PresenceWindowPosition {
        x: placement.x,
        y: placement.y,
        display_id: placement.display_id,
    }))
}

pub fn reinforce_presence_window_layer(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_always_on_top(true)?;
    configure_native_companion_overlay(window)?;
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
    let active_display = active_presence_display(window, &displays)?;
    let primary_display = window
        .primary_monitor()?
        .map(|monitor| presence_display_for_monitor(&monitor));

    Ok(resolve_presence_placement(
        saved_position,
        &displays,
        active_display.as_ref(),
        primary_display.as_ref(),
        window.outer_size()?,
    ))
}

fn active_presence_display(
    window: &WebviewWindow,
    displays: &[PresenceDisplay],
) -> tauri::Result<Option<PresenceDisplay>> {
    if let Some(focused_display) = focused_window_presence_display(displays) {
        return Ok(Some(focused_display));
    }

    window
        .current_monitor()
        .map(|monitor| monitor.map(|monitor| presence_display_for_monitor(&monitor)))
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

fn presence_display_for_monitor(monitor: &tauri::Monitor) -> PresenceDisplay {
    PresenceDisplay {
        id: monitor_id(monitor),
        work_area: *monitor.work_area(),
    }
}

fn monitor_id(monitor: &tauri::Monitor) -> Option<String> {
    monitor.name().map(ToOwned::to_owned)
}

fn resolve_presence_placement(
    saved_position: Option<PresenceWindowPosition>,
    displays: &[PresenceDisplay],
    active_display: Option<&PresenceDisplay>,
    primary_display: Option<&PresenceDisplay>,
    window_size: PhysicalSize<u32>,
) -> Option<PresencePlacement> {
    if displays.is_empty() {
        return None;
    }

    let default_display = active_display.or(primary_display).unwrap_or(&displays[0]);

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
        });

    let Some(saved_display) = saved_display else {
        let mut placement = default_presence_placement(default_display.work_area, window_size);
        placement.display_id = default_display.id.clone();
        placement.source = PresencePlacementSource::Clamped;
        return Some(placement);
    };

    if active_display.is_some_and(|display| !same_display(display, saved_display)) {
        let (x, y) = project_position_between_displays(
            &saved_position,
            saved_display,
            default_display,
            window_size,
        );

        return Some(PresencePlacement {
            x,
            y,
            anchor: PresenceAnchor::BottomRight,
            display_id: default_display.id.clone(),
            source: PresencePlacementSource::Followed,
        });
    }

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

fn same_display(left: &PresenceDisplay, right: &PresenceDisplay) -> bool {
    left.id == right.id
        && left.work_area.position.x == right.work_area.position.x
        && left.work_area.position.y == right.work_area.position.y
        && left.work_area.size.width == right.work_area.size.width
        && left.work_area.size.height == right.work_area.size.height
}

fn project_position_between_displays(
    position: &PresenceWindowPosition,
    source_display: &PresenceDisplay,
    target_display: &PresenceDisplay,
    window_size: PhysicalSize<u32>,
) -> (i32, i32) {
    let (source_x, source_y) = clamp_position_to_display(
        PhysicalPosition {
            x: position.x,
            y: position.y,
        },
        source_display.work_area,
        window_size,
    );

    (
        project_axis_position(
            source_x,
            source_display.work_area.position.x + PRESENCE_MARGIN,
            source_display.work_area.position.x + source_display.work_area.size.width as i32
                - window_size.width as i32
                - PRESENCE_MARGIN,
            target_display.work_area.position.x + PRESENCE_MARGIN,
            target_display.work_area.position.x + target_display.work_area.size.width as i32
                - window_size.width as i32
                - PRESENCE_MARGIN,
        ),
        project_axis_position(
            source_y,
            source_display.work_area.position.y + PRESENCE_MARGIN,
            source_display.work_area.position.y + source_display.work_area.size.height as i32
                - window_size.height as i32
                - PRESENCE_MARGIN,
            target_display.work_area.position.y + PRESENCE_MARGIN,
            target_display.work_area.position.y + target_display.work_area.size.height as i32
                - window_size.height as i32
                - PRESENCE_MARGIN,
        ),
    )
}

fn project_axis_position(
    value: i32,
    source_min: i32,
    source_max: i32,
    target_min: i32,
    target_max: i32,
) -> i32 {
    let source_max = source_max.max(source_min);
    let target_max = target_max.max(target_min);

    if source_max == source_min {
        return target_min;
    }

    let ratio = (value - source_min) as f64 / (source_max - source_min) as f64;
    let projected = target_min as f64 + ratio * (target_max - target_min) as f64;

    projected
        .round()
        .clamp(target_min as f64, target_max as f64) as i32
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

fn display_for_focused_window_rect<'a>(
    displays: &'a [PresenceDisplay],
    window_rect: &FocusedWindowRect,
) -> Option<&'a PresenceDisplay> {
    displays
        .iter()
        .filter_map(|display| {
            let overlap_area = rect_display_overlap_area(window_rect, display);

            if overlap_area > 0.0 {
                Some((display, overlap_area))
            } else {
                None
            }
        })
        .max_by(|(_, left_area), (_, right_area)| left_area.total_cmp(right_area))
        .map(|(display, _)| display)
}

fn rect_display_overlap_area(rect: &FocusedWindowRect, display: &PresenceDisplay) -> f64 {
    let display_left = display.work_area.position.x as f64;
    let display_top = display.work_area.position.y as f64;
    let display_right = display_left + display.work_area.size.width as f64;
    let display_bottom = display_top + display.work_area.size.height as f64;

    let rect_left = rect.x;
    let rect_top = rect.y;
    let rect_right = rect.x + rect.width;
    let rect_bottom = rect.y + rect.height;

    let overlap_width = rect_right.min(display_right) - rect_left.max(display_left);
    let overlap_height = rect_bottom.min(display_bottom) - rect_top.max(display_top);

    overlap_width.max(0.0) * overlap_height.max(0.0)
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
fn configure_native_companion_overlay(window: &WebviewWindow) -> tauri::Result<()> {
    use objc2_app_kit::{NSWindow, NSWindowAnimationBehavior};

    let ns_window = window.ns_window()?;

    unsafe {
        let ns_window: &NSWindow = &*ns_window.cast();
        let behavior = ns_window.collectionBehavior();

        ns_window.setLevel(macos_companion_overlay_window_level());
        ns_window.setCollectionBehavior(companion_overlay_collection_behavior(behavior));
        ns_window.setAnimationBehavior(NSWindowAnimationBehavior::UtilityWindow);
        ns_window.setCanHide(false);
        ns_window.orderFrontRegardless();
    }

    Ok(())
}

#[cfg(target_os = "macos")]
fn focused_window_presence_display(displays: &[PresenceDisplay]) -> Option<PresenceDisplay> {
    frontmost_window_rect()
        .and_then(|rect| display_for_focused_window_rect(displays, &rect).cloned())
}

#[cfg(not(target_os = "macos"))]
fn focused_window_presence_display(_displays: &[PresenceDisplay]) -> Option<PresenceDisplay> {
    None
}

#[cfg(target_os = "macos")]
fn frontmost_window_rect() -> Option<FocusedWindowRect> {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::dictionary::CFDictionary;
    use core_foundation::string::CFString;
    use core_graphics::window::{
        copy_window_info, kCGNullWindowID, kCGWindowBounds, kCGWindowLayer,
        kCGWindowListExcludeDesktopElements, kCGWindowListOptionOnScreenOnly, kCGWindowOwnerPID,
    };
    use objc2_app_kit::NSWorkspace;

    let frontmost_pid = NSWorkspace::sharedWorkspace()
        .frontmostApplication()
        .map(|application| application.processIdentifier())?;

    if frontmost_pid < 0 {
        return None;
    }

    let windows = copy_window_info(
        kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
        kCGNullWindowID,
    )?;
    let owner_pid_key = unsafe { CFString::wrap_under_get_rule(kCGWindowOwnerPID) };
    let layer_key = unsafe { CFString::wrap_under_get_rule(kCGWindowLayer) };
    let bounds_key = unsafe { CFString::wrap_under_get_rule(kCGWindowBounds) };

    windows
        .get_all_values()
        .into_iter()
        .find_map(|window_info| {
            let window_info = unsafe {
                CFDictionary::<CFString, CFType>::wrap_under_get_rule(
                    window_info as core_foundation::dictionary::CFDictionaryRef,
                )
            };
            let owner_pid = dictionary_i32(&window_info, &owner_pid_key)?;
            let layer = dictionary_i32(&window_info, &layer_key)?;

            if owner_pid != frontmost_pid || layer != 0 {
                return None;
            }

            dictionary_window_rect(&window_info, &bounds_key)
        })
}

#[cfg(target_os = "macos")]
fn dictionary_i32(
    dictionary: &core_foundation::dictionary::CFDictionary<
        core_foundation::string::CFString,
        core_foundation::base::CFType,
    >,
    key: &core_foundation::string::CFString,
) -> Option<i32> {
    dictionary
        .find(key)
        .and_then(|value| value.downcast::<core_foundation::number::CFNumber>())?
        .to_i32()
}

#[cfg(target_os = "macos")]
fn dictionary_window_rect(
    dictionary: &core_foundation::dictionary::CFDictionary<
        core_foundation::string::CFString,
        core_foundation::base::CFType,
    >,
    key: &core_foundation::string::CFString,
) -> Option<FocusedWindowRect> {
    use core_foundation::base::TCFType;

    let bounds = dictionary
        .find(key)?
        .downcast::<core_foundation::dictionary::CFDictionary>()?;
    let bounds = unsafe {
        core_foundation::dictionary::CFDictionary::<
            core_foundation::string::CFString,
            core_foundation::base::CFType,
        >::wrap_under_get_rule(bounds.as_concrete_TypeRef())
    };

    Some(FocusedWindowRect {
        x: dictionary_f64(&bounds, "X")?,
        y: dictionary_f64(&bounds, "Y")?,
        width: dictionary_f64(&bounds, "Width")?,
        height: dictionary_f64(&bounds, "Height")?,
    })
}

#[cfg(target_os = "macos")]
fn dictionary_f64(
    dictionary: &core_foundation::dictionary::CFDictionary<
        core_foundation::string::CFString,
        core_foundation::base::CFType,
    >,
    key: &'static str,
) -> Option<f64> {
    let key = core_foundation::string::CFString::from_static_string(key);

    dictionary
        .find(&key)
        .and_then(|value| value.downcast::<core_foundation::number::CFNumber>())?
        .to_f64()
}

#[cfg(target_os = "macos")]
fn companion_overlay_collection_behavior(
    behavior: objc2_app_kit::NSWindowCollectionBehavior,
) -> objc2_app_kit::NSWindowCollectionBehavior {
    use objc2_app_kit::NSWindowCollectionBehavior;

    (behavior
        | NSWindowCollectionBehavior::CanJoinAllSpaces
        | NSWindowCollectionBehavior::FullScreenAuxiliary
        | NSWindowCollectionBehavior::Stationary
        | NSWindowCollectionBehavior::IgnoresCycle)
        - NSWindowCollectionBehavior::MoveToActiveSpace
        - NSWindowCollectionBehavior::FullScreenPrimary
}

#[cfg(not(target_os = "macos"))]
fn configure_native_companion_overlay(_window: &WebviewWindow) -> tauri::Result<()> {
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
            Some(&display("sidecar", 1440, 0, 1280, 900)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("default placement");

        assert_eq!(placement.x, 2442);
        assert_eq!(placement.y, 602);
        assert_eq!(placement.display_id.as_deref(), Some("sidecar"));
        assert_eq!(placement.source, PresencePlacementSource::Default);
    }

    #[test]
    fn resolves_default_position_on_duplicate_named_active_display() {
        let active_display = display("Studio Display", 1440, 0, 1280, 900);
        let primary_display = display("Studio Display", 0, 25, 1440, 875);
        let placement = resolve_presence_placement(
            None,
            &[
                display("Studio Display", 0, 25, 1440, 875),
                display("Studio Display", 1440, 0, 1280, 900),
            ],
            Some(&active_display),
            Some(&primary_display),
            window_size(260, 280),
        )
        .expect("default placement");

        assert_eq!(placement.x, 2442);
        assert_eq!(placement.y, 602);
        assert_eq!(placement.display_id.as_deref(), Some("Studio Display"));
        assert_eq!(placement.source, PresencePlacementSource::Default);
    }

    #[test]
    fn keeps_saved_position_on_active_display_when_visible() {
        let placement = resolve_presence_placement(
            Some(saved_position(420, 520, Some("built-in"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some(&display("built-in", 0, 25, 1440, 875)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("saved placement");

        assert_eq!(placement.x, 420);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("built-in"));
        assert_eq!(placement.source, PresencePlacementSource::Saved);
    }

    #[test]
    fn follows_active_display_by_projecting_user_placement() {
        let placement = resolve_presence_placement(
            Some(saved_position(1620, 520, Some("sidecar"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some(&display("built-in", 0, 25, 1440, 875)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("followed placement");

        assert_eq!(placement.x, 206);
        assert_eq!(placement.y, 524);
        assert_eq!(placement.display_id.as_deref(), Some("built-in"));
        assert_eq!(placement.source, PresencePlacementSource::Followed);
    }

    #[test]
    fn follows_active_display_from_bottom_right_saved_position_without_losing_anchor() {
        let placement = resolve_presence_placement(
            Some(saved_position(1162, 602, Some("built-in"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some(&display("sidecar", 1440, 0, 1280, 900)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("followed bottom-right placement");

        assert_eq!(placement.x, 2442);
        assert_eq!(placement.y, 602);
        assert_eq!(placement.display_id.as_deref(), Some("sidecar"));
        assert_eq!(placement.source, PresencePlacementSource::Followed);
    }

    #[test]
    fn clamps_saved_position_before_following_active_display() {
        let placement = resolve_presence_placement(
            Some(saved_position(4000, -200, Some("sidecar"))),
            &[
                display("built-in", 0, 25, 1440, 875),
                display("sidecar", 1440, 0, 1280, 900),
            ],
            Some(&display("built-in", 0, 25, 1440, 875)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("clamped placement");

        assert_eq!(placement.x, 1162);
        assert_eq!(placement.y, 43);
        assert_eq!(placement.display_id.as_deref(), Some("built-in"));
        assert_eq!(placement.source, PresencePlacementSource::Followed);
    }

    #[test]
    fn clamps_saved_position_to_active_display_when_saved_display_is_missing() {
        let placement = resolve_presence_placement(
            Some(saved_position(2480, 520, Some("disconnected"))),
            &[display("built-in", 0, 25, 1440, 875)],
            Some(&display("built-in", 0, 25, 1440, 875)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("fallback placement");

        assert_eq!(placement.x, 1162);
        assert_eq!(placement.y, 602);
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
            Some(&display("sidecar", 1440, 0, 1280, 900)),
            Some(&display("built-in", 0, 25, 1440, 875)),
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
            Some(&display("Studio Display", 1440, 0, 1280, 900)),
            Some(&display("Studio Display", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("duplicate-name placement");

        assert_eq!(placement.x, 1500);
        assert_eq!(placement.y, 520);
        assert_eq!(placement.display_id.as_deref(), Some("Studio Display"));
        assert_eq!(placement.source, PresencePlacementSource::Saved);
    }

    #[test]
    fn selects_focused_window_display_by_largest_window_overlap() {
        let built_in = display("built-in", 0, 25, 1440, 875);
        let sidecar = display("sidecar", 1440, 0, 1280, 900);
        let focused_window = FocusedWindowRect {
            x: 1200.0,
            y: 100.0,
            width: 700.0,
            height: 500.0,
        };
        let displays = [built_in, sidecar];

        let active_display =
            display_for_focused_window_rect(&displays, &focused_window).expect("focused display");

        assert_eq!(active_display.id.as_deref(), Some("sidecar"));
    }

    #[test]
    fn ignores_focused_window_rect_when_it_does_not_overlap_displays() {
        let focused_window = FocusedWindowRect {
            x: 4000.0,
            y: 100.0,
            width: 700.0,
            height: 500.0,
        };
        let displays = [display("built-in", 0, 25, 1440, 875)];

        assert!(display_for_focused_window_rect(&displays, &focused_window).is_none());
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
            Some(&display("built-in", 0, 25, 1440, 875)),
            Some(&display("built-in", 0, 25, 1440, 875)),
            window_size(260, 280),
        )
        .expect("fallback placement");

        assert_eq!(placement.x, 1162);
        assert_eq!(placement.y, 602);
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
    fn companion_overlay_behavior_joins_spaces_without_becoming_primary() {
        use objc2_app_kit::NSWindowCollectionBehavior;

        let behavior = companion_overlay_collection_behavior(
            NSWindowCollectionBehavior::MoveToActiveSpace
                | NSWindowCollectionBehavior::FullScreenPrimary,
        );

        assert!(behavior.contains(NSWindowCollectionBehavior::CanJoinAllSpaces));
        assert!(behavior.contains(NSWindowCollectionBehavior::FullScreenAuxiliary));
        assert!(behavior.contains(NSWindowCollectionBehavior::Stationary));
        assert!(behavior.contains(NSWindowCollectionBehavior::IgnoresCycle));
        assert!(!behavior.contains(NSWindowCollectionBehavior::MoveToActiveSpace));
        assert!(!behavior.contains(NSWindowCollectionBehavior::FullScreenPrimary));
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn companion_overlay_level_sits_above_fullscreen_shielding() {
        let overlay_level = macos_companion_overlay_window_level();

        assert!(overlay_level > objc2_app_kit::NSScreenSaverWindowLevel);
        assert!(overlay_level > objc2_app_kit::NSPopUpMenuWindowLevel);
    }
}
