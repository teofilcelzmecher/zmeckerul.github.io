package com.budgiesocial.app;

import android.annotation.SuppressLint;
import android.content.Context;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.VibrationAttributes;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONObject;

/**
 * Budgie's feels (1.8). The page describes each moment as taps (how hard and how sharp, 0 to 1) and buzzes (a
 * vibration that lasts, rising or falling) at times in milliseconds (nook/js/fx.js), and this plays it with the best
 * the phone's vibrator has: on Android 11 and later with its haptic primitives (clicks, ticks, low ticks, thuds,
 * spins, rises and falls, each at its own strength); otherwise as a waveform of strengths, or plain on and off.
 * It's touch feedback, so it follows the phone's own setting for that.
 */
@CapacitorPlugin(name = "BudgieHaptics")
public class BudgieHapticsPlugin extends Plugin {
    private Vibrator vibrator;

    /** one tap or buzz */
    private static final class Feel {
        int t;
        boolean buzz;
        float i;
        float s;
        int d;
        String r;

        Feel(JSONObject e) {
            t = Math.max(0, e.optInt("t", 0));
            buzz = "buzz".equals(e.optString("k", "tap"));
            i = clamp((float) e.optDouble("i", 0.5));
            s = clamp((float) e.optDouble("s", 0.5));
            d = Math.max(20, Math.min(2000, e.optInt("d", 100)));
            r = e.optString("r", "");
        }
    }

    private static float clamp(float x) {
        return Math.max(0f, Math.min(1f, x));
    }

    @Override
    public void load() {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            vibrator = manager != null ? manager.getDefaultVibrator() : null;
        } else {
            vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
        }
    }

    @PluginMethod
    public void play(PluginCall call) {
        JSArray events = call.getArray("events");
        if (vibrator == null || !vibrator.hasVibrator() || events == null) {
            call.resolve();
            return;
        }
        try {
            List<Feel> feels = new ArrayList<>();
            for (int k = 0; k < Math.min(events.length(), 48); k++) feels.add(new Feel(events.getJSONObject(k)));
            feels.sort((a, b) -> Integer.compare(a.t, b.t));
            if (feels.isEmpty()) {
                call.resolve();
                return;
            }
            VibrationEffect effect = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) effect = composed(feels);
            if (effect == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) effect = waveform(feels);
            if (effect != null) vibrate(effect);
            else legacy(feels);
        } catch (Exception ignored) {
            // a feel that couldn't be played: nothing to do about it
        }
        call.resolve();
    }

    // ---- Android 11 and later: the haptic primitives -------------------------------------------------------------

    private boolean has(int primitive) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && vibrator.areAllPrimitivesSupported(primitive);
    }

    /** how long a primitive lasts on this phone (Android 12 says; before that, a fair guess) */
    @SuppressLint("WrongConstant")
    private int length(int primitive) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            int[] ms = vibrator.getPrimitiveDurations(primitive);
            if (ms.length > 0 && ms[0] > 0) return ms[0];
        }
        switch (primitive) {
            case VibrationEffect.Composition.PRIMITIVE_CLICK:
                return 12;
            case VibrationEffect.Composition.PRIMITIVE_TICK:
                return 6;
            case VibrationEffect.Composition.PRIMITIVE_QUICK_RISE:
                return 80;
            case VibrationEffect.Composition.PRIMITIVE_SLOW_RISE:
                return 300;
            case VibrationEffect.Composition.PRIMITIVE_QUICK_FALL:
                return 60;
            default:
                return 40;
        }
    }

    // the primitives are picked at run time from those this phone has (an unsupported one is never played)
    @SuppressLint("WrongConstant")
    private VibrationEffect composed(List<Feel> feels) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return null;
        int CLICK = VibrationEffect.Composition.PRIMITIVE_CLICK;
        int TICK = VibrationEffect.Composition.PRIMITIVE_TICK;
        // a vibrator without even clicks and ticks plays a waveform instead
        if (!has(CLICK) || !has(TICK)) return null;
        boolean s12 = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S;
        int LOW_TICK = s12 && has(VibrationEffect.Composition.PRIMITIVE_LOW_TICK) ? VibrationEffect.Composition.PRIMITIVE_LOW_TICK : TICK;
        int THUD = s12 && has(VibrationEffect.Composition.PRIMITIVE_THUD) ? VibrationEffect.Composition.PRIMITIVE_THUD : -1;
        int SPIN = s12 && has(VibrationEffect.Composition.PRIMITIVE_SPIN) ? VibrationEffect.Composition.PRIMITIVE_SPIN : -1;
        int QUICK_RISE = has(VibrationEffect.Composition.PRIMITIVE_QUICK_RISE) ? VibrationEffect.Composition.PRIMITIVE_QUICK_RISE : -1;
        int SLOW_RISE = has(VibrationEffect.Composition.PRIMITIVE_SLOW_RISE) ? VibrationEffect.Composition.PRIMITIVE_SLOW_RISE : -1;
        int QUICK_FALL = has(VibrationEffect.Composition.PRIMITIVE_QUICK_FALL) ? VibrationEffect.Composition.PRIMITIVE_QUICK_FALL : -1;

        // primitives play one after another, so a buzz that has taps inside it plays what's left of it after them
        List<Feel> plan = new ArrayList<>();
        for (Feel f : feels) {
            if (f.buzz) {
                int last = -1;
                for (Feel g : feels) if (!g.buzz && g.t >= f.t && g.t < f.t + f.d) last = Math.max(last, g.t);
                if (last >= 0) {
                    int end = f.t + f.d;
                    f.t = last + 1;
                    f.d = Math.max(40, end - f.t);
                }
            }
            plan.add(f);
        }
        plan.sort((a, b) -> Integer.compare(a.t, b.t));

        VibrationEffect.Composition c = VibrationEffect.startComposition();
        int end = 0;
        int added = 0;
        for (Feel f : plan) {
            float scale = f.i;
            int primitive;
            if (f.buzz) {
                if ("rise".equals(f.r) && (QUICK_RISE >= 0 || SLOW_RISE >= 0)) primitive = (f.d > 150 && SLOW_RISE >= 0) || QUICK_RISE < 0 ? SLOW_RISE : QUICK_RISE;
                else if ("fall".equals(f.r) && QUICK_FALL >= 0) primitive = QUICK_FALL;
                else if (SPIN >= 0) primitive = SPIN;
                else {
                    // no spin here: a run of ticks across the buzz
                    for (int at = f.t; at < f.t + f.d; at += 45) {
                        c.addPrimitive(TICK, Math.max(0.1f, scale * 0.8f), Math.max(0, at - end));
                        end = Math.max(end, at) + length(TICK);
                        added++;
                    }
                    continue;
                }
            } else if (f.s >= 0.75) {
                primitive = CLICK;
            } else if (f.s >= 0.45) {
                primitive = TICK;
                scale = Math.min(1f, scale * 1.15f);
            } else if (f.i >= 0.7 && THUD >= 0) {
                primitive = THUD;
            } else {
                primitive = LOW_TICK;
            }
            c.addPrimitive(primitive, Math.max(0.05f, scale), Math.max(0, f.t - end));
            end = Math.max(end, f.t) + length(primitive);
            added++;
        }
        return added > 0 ? c.compose() : null;
    }

    // ---- Android 8 to 10, or a simpler vibrator: a waveform of strengths ----------------------------------------

    private VibrationEffect waveform(List<Feel> feels) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return null;
        List<Long> times = new ArrayList<>();
        List<Integer> strengths = new ArrayList<>();
        int at = 0;
        for (Feel f : feels) {
            int start = Math.max(f.t, at);
            if (start > at) {
                times.add((long) (start - at));
                strengths.add(0);
            }
            if (f.buzz) {
                // a rising or falling buzz in four steps
                int steps = f.r.isEmpty() ? 1 : 4;
                for (int k = 0; k < steps; k++) {
                    float p = steps == 1 ? 1f : "rise".equals(f.r) ? (k + 1) / (float) steps : 1f - k / (float) steps;
                    times.add((long) Math.max(1, f.d / steps));
                    strengths.add(Math.max(1, Math.round(255 * f.i * p)));
                }
                at = start + f.d;
            } else {
                // a tap: short and strong for a sharp one, a little longer and softer for a dull one
                int ms = Math.round(8 + 10 * (1 - f.s) + 6 * f.i);
                times.add((long) ms);
                strengths.add(Math.max(1, Math.round(60 + 195 * f.i)));
                at = start + ms;
            }
        }
        long[] t = new long[times.size()];
        int[] a = new int[strengths.size()];
        for (int k = 0; k < t.length; k++) {
            t[k] = times.get(k);
            a[k] = strengths.get(k);
        }
        return VibrationEffect.createWaveform(t, a, -1);
    }

    // ---- Android 7: on and off ---------------------------------------------------------------------------------

    @SuppressWarnings("deprecation")
    private void legacy(List<Feel> feels) {
        List<Long> pattern = new ArrayList<>();
        pattern.add(0L);
        int at = 0;
        for (Feel f : feels) {
            int start = Math.max(f.t, at);
            int ms = f.buzz ? f.d : Math.round(10 + 14 * f.i);
            if (pattern.size() > 1) pattern.add((long) (start - at));
            else pattern.set(0, (long) start);
            pattern.add((long) ms);
            at = start + ms;
        }
        long[] p = new long[pattern.size()];
        for (int k = 0; k < p.length; k++) p[k] = pattern.get(k);
        vibrator.vibrate(p, -1);
    }

    @SuppressWarnings("deprecation")
    private void vibrate(VibrationEffect effect) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_TOUCH));
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(effect, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        }
    }
}
