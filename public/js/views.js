var replace_unit = function(val) {
  var r = val.replace(/\s*nm/, '*nanometers');
  r = r.replace(/\s*A/, '*angstroms');

  r = r.replace(/\s*\/fs/, '/femtoseconds');
  r = r.replace(/\s*\/ps/, '/picoseconds');
  r = r.replace(/\s*\/ns/, '/nanoseconds');

  r = r.replace(/\s*fs/, '*femtoseconds');
  r = r.replace(/\s*ps/, '*picoseconds');
  r = r.replace(/\s*ns/, '*nanoseconds');

  r = r.replace(/\s*K/, '*kelvin');

  r = r.replace(/\s*bar/, '*bars');
  r = r.replace(/\s*atm/, '*atmospheres');
  return r;
}

var OpenMMScriptView = Backbone.View.extend({
  initialize : function() {
    this.collection.bind('change', this.render);
    //setting the models attribute seems to be essential to getting
    // the initial render to go right, but gets overriden later...
    this.models = this.collection.models;
    this.render();

  },

  render: function() {
    that = this;
    var d = {}
    for (var i=0; i < that.models.length; i++) {
      var name = that.models[i].name;
      d[name] = that.models[i].toJSON();
    }


    opt = {
      pdb: d.general.coords_fn.match(/\.pdb$/) != null,
      amber: d.general.coords_fn.match(/\.inpcrd$/) != null,
      ex_water: d.general.protein.match(/_obc|_gbvi/) == null,
      nb_cutoff: d.system.nb_method != 'NoCutoff',
      cuda: d.general.platform == 'CUDA',
      open_cl: d.general.platform == 'OpenCL',
      variable_timestep: _.contains(['VariableLangevin', 'VariableVerlet'], d.integrator.kind),
    }

    var r = '##########################################################################\n';
    r += '# this script was generated by openmm-builder. to customize it further,\n'
    r += '# you can save the file to disk and edit it with your favorite editor.\n'
    r += '##########################################################################\n\n'
    r += 'from __future__ import print_function\n';
    r += 'from simtk.openmm.app import *\n';
    r += 'from simtk.openmm import *\n';
    r += 'from simtk.unit import *\n';
    r += 'from sys import stdout\n';
    if (d.system.random_initial_velocities == 'True') {
      r += 'import numpy as np\n';
    }


    if (opt.pdb) {
      r += "\npdb = PDBFile('" + d.general.coords_fn + "')\n";
      r += "forcefield = ForceField('" + d.general.protein + "'"
      if (opt.ex_water) {
        r += ", '" + d.general.water + "'";
      }
      r += ')\n\n';
      r += 'system = forcefield.createSystem(pdb.topology, '
    } else if (opt.amber) {
      r += "\nprmtop = AmberPrmtopFile('" + d.general.topology_fn + "')\n";
      r += "inpcrd = AmberInpcrdFile('" + d.general.coords_fn + "')\n\n";
      r += 'prmtop.createSystem('
    } else {
      bootbox.alert('Error!');
    }

    r += 'nonbondedMethod=' + d.system.nb_method + ',\n    '
    if (opt.nb_cutoff) {
      r += 'nonbondedCutoff=' + replace_unit(d.system.nb_cutoff) + ',';
    }
    r += ' constraints=' + d.system.constraints;
    r += ', rigidWater=' + d.system.rigid_water;
    r += ')\n';


    r += 'integrator = ' + d.integrator.kind + 'Integrator(';
    if (d.integrator.kind == 'Langevin' || d.integrator.kind == 'Brownian') {
      r += replace_unit(d.integrator.temperature) + ', '
      r += replace_unit(d.integrator.friction) + ', ';
    }
    if (opt.variable_timestep) {
      r += d.integrator.tolerance + ')\n'
    } else {
      r += replace_unit(d.integrator.timestep) + ')\n';
    }


    if (d.integrator.barostat == 'Monte Carlo') {
      r += "system.addForce(MonteCarloBarostat(" + replace_unit(d.integrator.pressure);
      r += ', ' + d.integrator.temperature + "))\n";
    }

    if (d.integrator.thermostat == 'Andersen') {
      r += 'system.addForce(AndersenThermostat(' + replace_unit(d.integrator.temperature);
      r += ', ' + replace_unit(d.integrator.friction) + '))\n'
    }

    r += '\n';

    r += "platform = Platform.getPlatformByName('" + d.general.platform + "')\n"
    if (opt.cuda) {
      r += "properties = {'CudaDeviceIndex': '" + d.general.device;
      r += "', 'CudaPrecision': '" + d.general.precision + "'}\n";
    } else if (opt.open_cl) {
      r += "properties = {'OpenCLDeviceIndex': '" + d.general.device + "', ";
      if (d.general.opencl_plat_index.length > 0) {
        r += "'OpenCLPlatformIndex': '" + d.general.opencl_plat_index + "',\n              ";
      }
      r += "'OpenCLPrecision': '" +  d.general.precision + "'}\n";
    }

    r += "simulation = Simulation(" + (opt.pdb ? "pdb" : "prmtop") + ".topology, system, integrator, platform";
    if (opt.cuda || opt.open_cl) {
      r += ', properties'
    }
    r += ')\n';

    if (opt.pdb) {
      r += 'simulation.context.setPositions(pdb.positions)\n\n'
    } else if (opt.amber) {
      r += 'simulation.context.setPositions(inpcrd.positions)\n\n'
    } else {
      bootbox.alert('Error!');
    }

    if (d.simulation.minimize == 'True') {
      r += "print('Minimizing...')\n"
      if (d.simulation.minimize_iters == '') {
        r += 'simulation.minimizeEnergy()\n'
      } else {
        r += 'simulation.minimizeEnergy(maxIterations=' + d.simulation.minimize_iters + ')\n';
      }
    }


    if (d.system.random_initial_velocities == 'True') {
      r += "\n# Generate random initial velocities from Maxwell-Boltzmann distribution.\n"
      r += 'velocities = Quantity(np.zeros([system.getNumParticles(), 3], np.float32),\n'
      r += '                      nanometers / picosecond)\n'
      r += 'kT = BOLTZMANN_CONSTANT_kB * AVOGADRO_CONSTANT_NA * ' + replace_unit(d.system.gentemp) + '\n'
      r += 'for atom_index in range(natoms):\n'
      r += '    atom_mass = system.getParticleMass(atom_index)\n'
      r += '    # standard deviation of velocity distribution for each coord for this atom\n'
      r += '    sigma = sqrt(kT / atom_mass)\n'
      r += '    velocities[atom_index, :] = sigma * np.random.normal(size=3)\n'
      r += 'system.context.setVelocities(velocities)\n\n'
    }

    if (d.simulation.equil_steps > 0) {
      r += "print('Equilibrating...')\n"
      r += 'simulation.step(' + d.simulation.equil_steps + ')\n\n'
    }

    if (d.simulation.dcd_reporter == 'True') {
      r += "simulation.reporters.append(DCDReporter('" + d.simulation.dcd_file + "'";
      r += ', ' + d.simulation.dcd_freq + "))\n"
    } if (d.simulation.statedata_reporter == 'True') {
      r += "simulation.reporters.append(StateDataReporter(stdout, " + d.simulation.statedata_freq
      r += ', step=True,\n    potentialEnergy=True, temperature=True))\n'
    } if (d.simulation.dcd_reporter == 'True' || d.simulation.statedata_reporter == 'True') {
      r += '\n';
    }


    r += "print('Running Production...')\n";
    r += 'simulation.step(' + d.simulation.prod_steps + ')\n';
    r += "print('Done!')\n";

    $("#code").html(prettyPrintOne(r));
  },
});
