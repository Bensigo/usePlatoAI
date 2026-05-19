use tauri::{PhysicalPosition, PhysicalRect, PhysicalSize, Position, WebviewWindow};

const PRESENCE_MARGIN: i32 = 18;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct PresencePlacement {
    x: i32,
    y: i32,
    anchor: PresenceAnchor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PresenceAnchor {
    BottomRight,
    BottomLeft,
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
        }
    } else {
        PresencePlacement {
            x: work_x + PRESENCE_MARGIN,
            y: bottom_y.max(work_y + PRESENCE_MARGIN),
            anchor: PresenceAnchor::BottomLeft,
        }
    }
}

pub fn configure_floating_presence_window(window: &WebviewWindow) -> tauri::Result<()> {
    window.set_visible_on_all_workspaces(false)?;
    configure_active_space_following(window)?;
    place_default_presence_window(window)?;

    Ok(())
}

fn place_default_presence_window(window: &WebviewWindow) -> tauri::Result<()> {
    let Some(monitor) = window.current_monitor()? else {
        return Ok(());
    };

    let placement = default_presence_placement(*monitor.work_area(), window.outer_size()?);
    window.set_position(Position::Physical(PhysicalPosition {
        x: placement.x,
        y: placement.y,
    }))
}

#[cfg(target_os = "macos")]
fn configure_active_space_following(window: &WebviewWindow) -> tauri::Result<()> {
    use objc2_app_kit::{NSWindow, NSWindowAnimationBehavior, NSWindowCollectionBehavior};

    let ns_window = window.ns_window()?;

    unsafe {
        let ns_window: &NSWindow = &*ns_window.cast();
        let behavior = ns_window.collectionBehavior();

        ns_window.setCollectionBehavior(
            (behavior | NSWindowCollectionBehavior::MoveToActiveSpace)
                - NSWindowCollectionBehavior::CanJoinAllSpaces,
        );
        ns_window.setAnimationBehavior(NSWindowAnimationBehavior::UtilityWindow);
    }

    Ok(())
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
}
