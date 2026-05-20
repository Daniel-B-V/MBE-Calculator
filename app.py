from flask import Flask, render_template, request, jsonify
import sympy as sp

app = Flask(__name__)

# ─── EQUATION CONFIGS ─────────────────────────────────────────────────────────
EQUATIONS = {
    "1. Oil Initial in Place (N)": {
        "vars": ["N","Np","Bo","Rp","Rs","Bg","We","Wp","Bw","Ginj","Binj","Winj","Boi","Rsi","m","Bgi","Swi","cw","cf","dp"],
        "expr": {
            "N": "( Np*(Bo + (Rp-Rs)*Bg) - (We - Wp*Bw) - Ginj*Binj - Winj*Bw ) / ( (Bo-Boi) + (Rsi-Rs)*Bg + m*Boi*(Bg/Bgi - 1) + Boi*(1+m)*((Swi*cw + cf)/(1-Swi))*dp )"
        },
        "formula_display": "N = [ Np(Bo+(Rp-Rs)Bg) - (We-WpBw) - Ginj·Binj - Winj·Bw ] / [ (Bo-Boi)+(Rsi-Rs)Bg + mBoi(Bg/Bgi-1) + Boi(1+m)((Swi·cw+cf)/(1-Swi))·Δp ]",
        "solve_for": "N",
    },
    "2. Gas Initial in Place (G)": {
        "vars": ["G","Gp","Bg","We","Wp","Bw","Bgi","Swi","cw","cf","dp"],
        "expr": {
            "G": "( Gp*Bg - (We - Wp*Bw) ) / ( Bg - Bgi + Bgi*((Swi*cw + cf)/(1-Swi))*dp )"
        },
        "formula_display": "G = [ Gp·Bg - (We - Wp·Bw) ] / [ Bg - Bgi + Bgi((Swi·cw+cf)/(1-Swi))·Δp ]",
        "solve_for": "G",
    },
    "3a. Recovery Index – DDI": {
        "vars": ["DDI","N","Bt","Bti","A"],
        "expr": {"DDI": "N*(Bt - Bti) / A"},
        "formula_display": "DDI = N(Bt - Bti) / A",
        "solve_for": "DDI",
    },
    "3b. Recovery Index – SDI": {
        "vars": ["SDI","N","m","Bti","Bg","Bgi","A"],
        "expr": {"SDI": "N*m*Bti*(Bg/Bgi - 1) / A"},
        "formula_display": "SDI = N·m·Bti(Bg/Bgi - 1) / A",
        "solve_for": "SDI",
    },
    "3c. Recovery Index – WDI": {
        "vars": ["WDI","We","Wp","Bw","A"],
        "expr": {"WDI": "(We - Wp*Bw) / A"},
        "formula_display": "WDI = (We - Wp·Bw) / A",
        "solve_for": "WDI",
    },
    "3d. Recovery Index – EDI": {
        "vars": ["EDI","N","Boi","m","cw","Swi","cf","pi","p","A"],
        "expr": {"EDI": "N*Boi*(1+m)*((cw*Swi + cf)/(1-Swi))*(pi - p) / A"},
        "formula_display": "EDI = N·Boi(1+m)[(cw·Swi+cf)/(1-Swi)](pi-p) / A",
        "solve_for": "EDI",
    },
    "3e. Parameter A": {
        "vars": ["A","Np","Bt","Rp","Rsi","Bg"],
        "expr": {"A": "Np*(Bt + (Rp - Rsi)*Bg)"},
        "formula_display": "A = Np[ Bt + (Rp - Rsi)·Bg ]",
        "solve_for": "A",
    },
    "4. Recovery Factor (RF)": {
        "vars": ["RF","Np","N"],
        "expr": {"RF": "Np / N"},
        "formula_display": "RF = Np / N",
        "solve_for": "RF",
    },
    "5. Free Gas Saturation (Sg)": {
        "vars": ["Sg","Np","N","Bo","Boi","Swc"],
        "expr": {"Sg": "1 - (1 - Np/N)*(Bo/Boi)*(1 - Swc)"},
        "formula_display": "Sg = 1 - (1 - Np/N)(Bo/Boi)(1 - Swc)",
        "solve_for": "Sg",
    },
}

PARAMETERS = [
    ("N",    "oil initially in place",                                          "STB"),
    ("G",    "Gas in Place",                                                    "rb"),
    ("Boi",  "oil formation volume factor at initial reservoir pressure",       "bbl/STB"),
    ("m",    "ratio of gas-cap volume to the oil zone volume",                  "dimensionless"),
    ("Np",   "cumulative oil production",                                       "STB"),
    ("Bo",   "oil formation volume factor at reservoir pressure",               "bbl/STB"),
    ("Bgi",  "gas formation volume factor at initial reservoir pressure",       "bbl/SCF"),
    ("Bg",   "current gas formation volume factor",                             "bbl/SCF"),
    ("Rp",   "net cumulative produced gas-oil ratio",                           "scf/STB"),
    ("Rs",   "current gas solubility factor",                                   "scf/STB"),
    ("Rsi",  "gas solubility factor at initial reservoir pressure",             "SCF/STB"),
    ("We",   "cumulative water influx",                                         "bbl"),
    ("Wp",   "cumulative water produced",                                       "STB"),
    ("Bw",   "water formation volume factor",                                   "bbl/STB"),
    ("dp",   "change in reservoir pressure Δp (pi – p)",                       "psi"),
    ("Ginj", "cumulative gas injected",                                         "scf"),
    ("Binj", "injected gas formation volume factor",                            "bbl/SCF"),
    ("Winj", "cumulative water injected",                                       "STB"),
    ("cw",   "water compressibility coefficient",                               "psi⁻¹"),
    ("cf",   "Formation rock compressibility factor",                           "psi⁻¹"),
    ("Swi",  "Initial water saturation",                                        "fraction"),
    ("Swc",  "connate water saturation",                                        "fraction"),
    ("Bt",   "two-phase formation volume factor",                               "bbl/STB"),
    ("Bti",  "two-phase FVF at initial conditions",                             "bbl/STB"),
    ("A",    "MBE parameter A = Np[Bt+(Rp-Rsi)Bg]",                            "bbl"),
    ("Gp",   "cumulative gas produced",                                         "scf"),
    ("pi",   "initial reservoir pressure",                                      "psia"),
    ("p",    "current reservoir pressure",                                      "psia"),
    ("DDI",  "depletion-drive index",                                           "fraction"),
    ("SDI",  "segregation-drive index",                                         "fraction"),
    ("WDI",  "water-drive index",                                               "fraction"),
    ("EDI",  "expansion-drive index",                                           "fraction"),
    ("RF",   "Recovery Factor",                                                 "fraction"),
    ("Sg",   "Free Gas Saturation",                                             "fraction"),
]


# ─── ROUTES ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/equations", methods=["GET"])
def get_equations():
    result = {}
    for name, eq in EQUATIONS.items():
        result[name] = {
            "vars": eq["vars"],
            "formula_display": eq["formula_display"],
            "solve_for": eq["solve_for"],
        }
    return jsonify(result)


@app.route("/api/parameters", methods=["GET"])
def get_parameters():
    return jsonify([
        {"symbol": sym, "description": desc, "unit": unit}
        for sym, desc, unit in PARAMETERS
    ])


@app.route("/api/calculate", methods=["POST"])
def calculate():
    data = request.get_json()
    eq_name   = data.get("equation")
    solve_for = data.get("solve_for")
    values    = data.get("values", {})

    if eq_name not in EQUATIONS:
        return jsonify({"error": f"Unknown equation: {eq_name}"}), 400

    eq = EQUATIONS[eq_name]
    all_vars = eq["vars"]
    # Use the requested `solve_for` key to fetch the expression for that variable
    expr_str = eq["expr"].get(solve_for)
    if expr_str is None:
        return jsonify({"error": f"No expression defined to solve for {solve_for}"}), 400

    syms = {v: sp.Symbol(v) for v in all_vars}

    # Parse known values
    known = {}
    missing = []
    for vname in all_vars:
        if vname == solve_for:
            continue
        if vname not in values or values[vname] == "":
            missing.append(vname)
        else:
            try:
                known[vname] = float(values[vname])
            except (ValueError, TypeError):
                return jsonify({"error": f"Invalid value for {vname}: '{values[vname]}'"}), 400

    if missing:
        return jsonify({"error": f"Missing values for: {', '.join(missing)}"}), 400

    try:
        expr = sp.sympify(expr_str, locals=syms)

        # First try evaluating the expression directly with known values
        try:
            result_val = expr.subs(known)
            result = float(result_val)
        except Exception:
            # If direct substitution doesn't produce a numeric result, attempt to solve
            equation = sp.Eq(syms[solve_for], expr)
            solved = sp.solve(equation, syms[solve_for])
            if not solved:
                return jsonify({"error": f"Could not solve for {solve_for}"}), 400
            result = float(solved[0].subs(known))

        unit = next((p[2] for p in PARAMETERS if p[0] == solve_for), "")
        return jsonify({"result": result, "unit": unit, "variable": solve_for})

    except ZeroDivisionError:
        return jsonify({"error": "Division by zero — check your inputs"}), 400
    except Exception as ex:
        return jsonify({"error": str(ex)}), 500


@app.route("/api/regression", methods=["POST"])
def regression():
    """Returns best-fit slope, intercept, and slope from first two points."""
    data = request.get_json()
    xs = data.get("x", [])
    ys = data.get("y", [])

    if len(xs) < 2 or len(ys) < 2 or len(xs) != len(ys):
        return jsonify({"error": "Need at least 2 matching (x, y) pairs"}), 400

    try:
        xs = [float(v) for v in xs]
        ys = [float(v) for v in ys]
    except (ValueError, TypeError):
        return jsonify({"error": "All x and y values must be numbers"}), 400

    n = len(xs)
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((xi - mean_x) * (yi - mean_y) for xi, yi in zip(xs, ys))
    den = sum((xi - mean_x) ** 2 for xi in xs)
    slope = num / den if den != 0 else 0
    intercept = mean_y - slope * mean_x

    slope_12 = (ys[1] - ys[0]) / (xs[1] - xs[0]) if (xs[1] - xs[0]) != 0 else None

    # Generate line points
    x_min, x_max = min(xs) - 0.5, max(xs) + 0.5
    line_x = [x_min, x_max]
    line_y = [slope * xv + intercept for xv in line_x]

    return jsonify({
        "slope": slope,
        "intercept": intercept,
        "slope_pts12": slope_12,
        "line_x": line_x,
        "line_y": line_y,
        "data_x": xs,
        "data_y": ys,
    })


if __name__ == "__main__":
    app.run(debug=True, port=5000)