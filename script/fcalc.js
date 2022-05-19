// JS for my finance calculator.
//
//      Connor Shugg

// income statement globals
const in_ins_income_gross = document.getElementById("ins_income_gross");
const in_ins_income_taxes = document.getElementById("ins_income_taxes");
const in_ins_expenses = document.getElementById("ins_expenses");
const out_ins_income = document.getElementById("ins_out_income");
const out_ins_surplus = document.getElementById("ins_out_surplus");
let ins_total = 0.0;

// balance sheet globals - assets
const in_bs_a_monetary = document.getElementById("bs_a_monetary");
const in_bs_a_investments = document.getElementById("bs_a_investments");
const in_bs_a_retirement = document.getElementById("bs_a_retirement");
const in_bs_a_housing = document.getElementById("bs_a_housing");
const in_bs_a_other = document.getElementById("bs_a_other");
const out_bs_a = document.getElementById("bs_out_a");
const bs_a_operands = [ // used to compute the total
    in_bs_a_monetary,
    in_bs_a_investments,
    in_bs_a_retirement,
    in_bs_a_housing,
    in_bs_a_other
];
let bs_a_total = 0.0;

// balance sheet globals - current liabilities
const in_bs_cl_ltp = document.getElementById("bs_cl_ltp");
const in_bs_cl_bills = document.getElementById("bs_cl_bills");
const in_bs_cl_cc = document.getElementById("bs_cl_cc");
const out_bs_cl = document.getElementById("bs_out_cl");
const bs_cl_operands = [ // used to compute the total
    in_bs_cl_ltp,
    in_bs_cl_bills,
    in_bs_cl_cc
];
let bs_cl_total = 0.0;

// balance sheet globals - long-term liabilities
const in_bs_ltl_housing = document.getElementById("bs_ltl_housing");
const in_bs_ltl_car = document.getElementById("bs_ltl_car");
const in_bs_ltl_other = document.getElementById("bs_ltl_other");
const out_bs_ltl = document.getElementById("bs_out_ltl");
const bs_ltl_operands = [ // used to compute the total
    in_bs_ltl_housing,
    in_bs_ltl_car,
    in_bs_ltl_other
];
let bs_ltl_total = 0.0;

// net worth globals
const out_bs_networth = document.getElementById("bs_out_networth");
let bs_networth = 0.0;

// ratio globals
const out_ratio_current = document.getElementById("ratio_current");
const out_ratio_mlec = document.getElementById("ratio_mlec");
const out_ratio_debt = document.getElementById("ratio_debt");
const out_ratio_ltdc = document.getElementById("ratio_ltdc");
const out_ratio_savings = document.getElementById("ratio_savings");


/********************************** Helpers ***********************************/
// Takes in an input HTML element and tries to parse out a float. Returns NaN if
// an invalid value is detected. Returns 0.0 if the input field is empty.
function get_input_float(input)
{
    let val = input.value;
    // return 0 if the value is empty
    if (val === "")
    { return 0.0; }

    // otherwise, attempt to parse as a float. Return NaN on error.
    try
    { val = parseFloat(val); }
    catch (error)
    { return NaN; }
    if (isNaN(val))
    { return NaN; }

    // otherwise, return the float
    return val;
}

// Takes in a float value and returns a US-dollar-formatted string.
function float_to_dollar_string(value)
{
    let formatter = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    return formatter.format(value);
}

// Updates a given HTML element's .innerHTML to show an error message.
function show_error(element)
{
    element.innerHTML = "(ERROR)";
}


/******************************** Computations ********************************/
// Pulls all values from all text boxes and computes all values and updates the
// appropriate HTML fields to display them.
function compute_all()
{
    // first, we'll total up the income statement
    ins_total = 0.0;
    let ins_income = get_input_float(in_ins_income_gross) -
                     get_input_float(in_ins_income_taxes);
    // update the after-tax income field
    if (!isNaN(ins_income))
    { ins_out_income.innerHTML = float_to_dollar_string(ins_income); }
    else
    { show_error(ins_out_income); }
    // retrieve expenses and compute the total
    let ins_expenses = get_input_float(in_ins_expenses);
    if (!isNaN(ins_income) && !isNaN(ins_expenses))
    {
        ins_total = ins_income - ins_expenses;
        ins_out_surplus.innerHTML = float_to_dollar_string(ins_total);
    }
    else
    { show_error(ins_out_surplus); }

    // next, we'll total up all assets on the balance sheet
    bs_a_total = 0.0
    for (let i = 0; i < bs_a_operands.length; i++)
    {
        // convert the field's float value. Break if NaN is detected
        const val = get_input_float(bs_a_operands[i]);
        if (isNaN(val))
        {
            bs_a_total = NaN;
            break;
        }
        bs_a_total += val;
    }
    // update the correct field depending on our result
    if (!isNaN(bs_a_total))
    { out_bs_a.innerHTML = float_to_dollar_string(bs_a_total); }
    else
    { show_error(out_bs_a); }

    // next, total up all current liabilities
    bs_cl_total = 0.0;
    for (let i = 0; i < bs_cl_operands.length; i++)
    {
        // convert the field's float value. Break if NaN is detected
        const val = get_input_float(bs_cl_operands[i]);
        if (isNaN(val))
        {
            bs_cl_total = NaN;
            break;
        }
        bs_cl_total += val;
    }
    // update the correct field depending on our result
    if (!isNaN(bs_cl_total))
    { out_bs_cl.innerHTML = float_to_dollar_string(bs_cl_total); }
    else
    { show_error(out_bs_cl); }

    // next, total up all long-term liabilities
    bs_ltl_total = 0.0;
    for (let i = 0; i < bs_ltl_operands.length; i++)
    {
        // convert the field's float value. Break if NaN is detected
        const val = get_input_float(bs_ltl_operands[i]);
        if (isNaN(val))
        {
            bs_ltl_total = NaN;
            break;
        }
        bs_ltl_total += val;
    }
    // update the correct field depending on our result
    if (!isNaN(bs_ltl_total))
    { out_bs_ltl.innerHTML = float_to_dollar_string(bs_ltl_total); }
    else
    { show_error(out_bs_ltl); }

    // compute and display the net worth
    bs_networth = 0.0
    if (isNaN(bs_a_total) || isNaN(bs_ltl_total))
    { show_error(out_bs_networth); }
    else
    {
        bs_networth = bs_a_total - bs_ltl_total;
        out_bs_networth.innerHTML = float_to_dollar_string(bs_networth);
    }

    // finally, we'll compute the ratios
    // CURRENT RATIO
    const monetary_assets = get_input_float(in_bs_a_monetary);
    let ratio_current = monetary_assets / bs_cl_total;
    if (!isNaN(ratio_current))
    { out_ratio_current.innerHTML = ratio_current; }
    else
    { show_error(out_ratio_current); }

    // MLEC RATIO
    let ratio_mlec = monetary_assets / ins_expenses;
    if (!isNaN(ratio_mlec))
    { out_ratio_mlec.innerHTML = ratio_mlec; }
    else
    { show_error(out_ratio_mlec); }

    // DEBT RATIO
    let ratio_debt = (bs_cl_total + bs_ltl_total) / bs_a_total;
    if (!isNaN(ratio_debt))
    { out_ratio_debt.innerHTML = ratio_debt; }
    else
    { show_error(out_ratio_debt); }

    // LTDC RATIO
    let ratio_ltdc = get_input_float(in_bs_cl_ltp) /
                     get_input_float(in_ins_income_gross);
    if (!isNaN(ratio_ltdc))
    { out_ratio_ltdc.innerHTML = ratio_ltdc; }
    else
    { show_error(out_ratio_ltdc); }

    // SAVINGS RATIO
    let ratio_savings = ins_total / get_input_float(in_ins_income_gross);
    if (!isNaN(ratio_savings))
    { out_ratio_savings.innerHTML = ratio_savings; }
    else
    { show_error(out_ratio_savings); }
}


/*********************************** Setup ************************************/
window.onload = function()
{
    // give all input fields a "change" event listener to trigger recomputation
    const inputs = document.getElementsByTagName("input");
    for (let i = 0; i < inputs.length; i++)
    { inputs[i].addEventListener("input", compute_all); }
}

